import { createServer, type IncomingMessage } from "node:http";
import { randomInt } from "node:crypto";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import {
  applyAction,
  createGame,
  receiveGarbage,
  tick,
  type GameEvent,
  type GameState,
  type PlayerAction,
} from "@tetris/game-engine";
import {
  parseClientMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type PlayerPresence,
  type RoomStatus,
  type SerializedPlayer,
  type ServerMessage,
} from "@tetris/protocol";

export interface ServerConfig {
  port: number;
  roomTtlMs?: number;
  /** How long a player may be disconnected mid-match before forfeiting. */
  disconnectGraceMs?: number;
  /** How long a disconnected player keeps their seat outside a running match (lets a page refresh rejoin). */
  lobbyGraceMs?: number;
  countdownMs?: number;
  tickMs?: number;
  heartbeatMs?: number;
  presenceMs?: number;
  maxRooms?: number;
  /** Token bucket per socket: burst size and sustained messages per second. */
  rateBurst?: number;
  ratePerSecond?: number;
  log?: (event: string, data: Record<string, unknown>) => void;
}

export interface RunningServer {
  readonly port: number;
  close(): Promise<void>;
}

/** Close code sent to a socket that has been replaced by a newer connection for the same session. */
export const CLOSE_REPLACED = 4000;
const MAX_PAYLOAD_BYTES = 2048;
const MAX_TICK_DT_MS = 250;
const STRIKES_BEFORE_KICK = 1000;

interface PlayerSlot {
  readonly playerId: 1 | 2;
  sessionId: string;
  socket: WebSocket | null;
  ready: boolean;
  disconnectedAt: number | null;
  /** True once the player has left for good (or forfeited); the seat is only kept to show the result. */
  departed: boolean;
  game: GameState | null;
}

interface Room {
  readonly code: string;
  readonly createdAt: number;
  status: RoomStatus;
  countdownEndsAt: number | null;
  seed: number;
  winner: 1 | 2 | null;
  /** Created by the matchmaking queue rather than by a player sharing a code. */
  quickMatch: boolean;
  /** Match state changed since the last broadcast. */
  dirty: boolean;
  players: [PlayerSlot, PlayerSlot | null];
}

interface Seat {
  roomCode: string;
  playerId: 1 | 2;
}

interface QueueEntry {
  socket: WebSocket;
  sessionId: string;
}

export function startServer(config: ServerConfig): Promise<RunningServer> {
  const ROOM_TTL_MS = config.roomTtlMs ?? 60 * 60 * 1000;
  const DISCONNECT_GRACE_MS = config.disconnectGraceMs ?? 10_000;
  const LOBBY_GRACE_MS = config.lobbyGraceMs ?? 30_000;
  const COUNTDOWN_MS = config.countdownMs ?? 3000;
  const TICK_MS = config.tickMs ?? 33;
  const HEARTBEAT_MS = config.heartbeatMs ?? 25_000;
  const PRESENCE_MS = config.presenceMs ?? 5000;
  const MAX_ROOMS = config.maxRooms ?? 500;
  const RATE_BURST = config.rateBurst ?? 120;
  const RATE_PER_SECOND = config.ratePerSecond ?? 120;
  const log = config.log ?? (() => undefined);

  const rooms = new Map<string, Room>();
  /** sessionId -> seat, so a returning player can reclaim their place. */
  const sessionSeats = new Map<string, Seat>();
  /** socket -> seat, so message handling is O(1) instead of scanning every session. */
  const socketSeats = new Map<WebSocket, Seat>();
  const queue: QueueEntry[] = [];
  const buckets = new Map<WebSocket, { tokens: number; last: number; strikes: number }>();
  const alive = new Map<WebSocket, boolean>();

  // ---------------------------------------------------------------- sending

  function send(socket: WebSocket | null, message: ServerMessage): void {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function error(socket: WebSocket, code: string, message: string): void {
    send(socket, { type: "ERROR", protocolVersion: PROTOCOL_VERSION, code, message });
  }

  function roomState(room: Room, playerId: 1 | 2): ServerMessage {
    return {
      type: "ROOM_STATE",
      protocolVersion: PROTOCOL_VERSION,
      roomCode: room.code,
      playerId,
      players: room.players.filter((player): player is PlayerSlot => player !== null).map((player): PlayerPresence => ({
        playerId: player.playerId,
        connected: player.socket !== null && !player.departed,
        ready: player.ready,
      })),
      status: room.status,
      countdownEndsAt: room.countdownEndsAt,
      quickMatch: room.quickMatch,
    };
  }

  function broadcastRoom(room: Room): void {
    for (const player of room.players) {
      if (player) send(player.socket, roomState(room, player.playerId));
    }
  }

  function serializeGame(game: GameState): SerializedPlayer {
    return {
      board: game.board,
      active: game.active,
      hold: game.hold,
      queue: game.queue,
      score: game.score,
      lines: game.lines,
      level: game.level,
      pendingGarbage: game.pendingGarbage,
      garbageSent: game.garbageSent,
      gameOverReason: game.gameOverReason,
    };
  }

  function broadcastMatch(room: Room): void {
    room.dirty = false;
    const first = room.players[0];
    const second = room.players[1];
    if (!first?.game || !second?.game) return;
    const status = room.status === "FINISHED" ? "finished" : "playing";
    const serverTime = Date.now();
    send(first.socket, {
      type: "MATCH_STATE",
      protocolVersion: PROTOCOL_VERSION,
      status,
      serverTime,
      player: serializeGame(first.game),
      opponent: serializeGame(second.game),
      winner: room.winner,
    });
    send(second.socket, {
      type: "MATCH_STATE",
      protocolVersion: PROTOCOL_VERSION,
      status,
      serverTime,
      player: serializeGame(second.game),
      opponent: serializeGame(first.game),
      winner: room.winner,
    });
  }

  /** Sends the online/searching counts to everyone who is not in a room. */
  function broadcastPresence(): void {
    for (const socket of websocketServer.clients) {
      if (!socketSeats.has(socket)) send(socket, queueState(socket));
    }
  }

  let presenceTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Coalesces bursts of joins/leaves into one update so the counts feel live without flooding clients. */
  function schedulePresence(): void {
    if (presenceTimeout !== null) return;
    presenceTimeout = setTimeout(() => {
      presenceTimeout = null;
      broadcastPresence();
    }, 150);
  }

  function queueState(socket: WebSocket): ServerMessage {
    return {
      type: "QUEUE_STATE",
      protocolVersion: PROTOCOL_VERSION,
      searching: queue.some((entry) => entry.socket === socket),
      playersOnline: websocketServer.clients.size,
      playersSearching: queue.length,
    };
  }

  // ------------------------------------------------------------------ rooms

  function registerSeat(room: Room, slot: PlayerSlot): void {
    const seat: Seat = { roomCode: room.code, playerId: slot.playerId };
    sessionSeats.set(slot.sessionId, seat);
    if (slot.socket) socketSeats.set(slot.socket, seat);
  }

  function newSlot(playerId: 1 | 2, sessionId: string, socket: WebSocket): PlayerSlot {
    return { playerId, sessionId, socket, ready: false, disconnectedAt: null, departed: false, game: null };
  }

  function createRoom(quickMatch: boolean, sessionId: string, socket: WebSocket): Room {
    let code = "";
    do {
      code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)]).join("");
    } while (rooms.has(code));
    const room: Room = {
      code,
      createdAt: Date.now(),
      status: "WAITING",
      countdownEndsAt: null,
      seed: randomInt(0, 0x7fffffff),
      winner: null,
      quickMatch,
      dirty: false,
      players: [newSlot(1, sessionId, socket), null],
    };
    rooms.set(code, room);
    registerSeat(room, room.players[0]);
    log("room_created", { room: code, quickMatch });
    return room;
  }

  function deleteRoom(room: Room): void {
    for (const player of room.players) {
      if (!player) continue;
      if (player.socket) socketSeats.delete(player.socket);
      if (sessionSeats.get(player.sessionId)?.roomCode === room.code) sessionSeats.delete(player.sessionId);
    }
    rooms.delete(room.code);
    log("room_closed", { room: room.code });
  }

  /**
   * Seats a session in a room. A session that already holds a seat reclaims it
   * (page refresh / reconnect). New players are only seated when allowNew is set.
   */
  function seatPlayer(room: Room, sessionId: string, socket: WebSocket, allowNew: boolean): PlayerSlot | null {
    const existing = room.players.find((player) => player?.sessionId === sessionId && !player.departed);
    if (existing) {
      const previous = existing.socket;
      if (previous && previous !== socket) {
        // Same session opened elsewhere: the newest connection wins.
        socketSeats.delete(previous);
        previous.close(CLOSE_REPLACED, "Opened in another tab");
      }
      existing.socket = socket;
      existing.disconnectedAt = null;
      registerSeat(room, existing);
      return existing;
    }
    if (!allowNew || room.players[1] !== null) return null;
    const slot = newSlot(2, sessionId, socket);
    room.players[1] = slot;
    registerSeat(room, slot);
    log("room_joined", { room: room.code });
    return slot;
  }

  /**
   * Rebuilds a room after players left: removes departed seats, renumbers the
   * remaining players from 1, and resets to a fresh lobby.
   */
  function resetRoom(room: Room): void {
    const remaining = room.players.filter((player): player is PlayerSlot => player !== null && !player.departed);
    for (const player of room.players) {
      if (player?.departed && sessionSeats.get(player.sessionId)?.roomCode === room.code) {
        sessionSeats.delete(player.sessionId);
      }
    }
    const first = remaining[0];
    if (!first) {
      deleteRoom(room);
      return;
    }
    const second = remaining[1];
    room.players = [
      { ...first, playerId: 1, ready: false, game: null },
      second ? { ...second, playerId: 2, ready: false, game: null } : null,
    ];
    room.status = "WAITING";
    room.countdownEndsAt = null;
    room.winner = null;
    room.seed = randomInt(0, 0x7fffffff);
    room.dirty = false;
    if (!second) room.quickMatch = false;
    for (const player of room.players) if (player) registerSeat(room, player);
    broadcastRoom(room);
  }

  /** Every match ends here, so clients always receive the final match state and the FINISHED room status. */
  function finishMatch(room: Room, winner: 1 | 2): void {
    if (room.status !== "PLAYING") return;
    room.winner = winner;
    room.status = "FINISHED";
    room.countdownEndsAt = null;
    log("match_completed", { room: room.code, winner });
    broadcastMatch(room);
    broadcastRoom(room);
  }

  function forfeit(room: Room, slot: PlayerSlot): void {
    if (room.status !== "PLAYING") return;
    if (slot.game) slot.game = { ...slot.game, status: "gameover", gameOverReason: "BLOCK_OUT", active: null };
    log("match_forfeited", { room: room.code, loser: slot.playerId });
    finishMatch(room, slot.playerId === 1 ? 2 : 1);
  }

  /** A player deliberately leaves (LEAVE, or starts another room/queue). */
  function leaveSeat(socket: WebSocket): void {
    const seat = socketSeats.get(socket);
    if (!seat) return;
    socketSeats.delete(socket);
    const room = rooms.get(seat.roomCode);
    const slot = room?.players[seat.playerId - 1] ?? null;
    if (!room || !slot) return;
    slot.socket = null;
    if (room.status === "PLAYING") {
      forfeit(room, slot);
      slot.departed = true;
    } else if (room.status === "FINISHED") {
      slot.departed = true;
      broadcastRoom(room);
    } else {
      slot.departed = true;
      resetRoom(room);
    }
    log("player_left", { room: room.code, player: slot.playerId });
  }

  // -------------------------------------------------------------- match flow

  function startCountdown(room: Room): void {
    if (room.status !== "READY_CHECK") return;
    room.status = "COUNTDOWN";
    room.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    broadcastRoom(room);
  }

  function startMatch(room: Room): void {
    const [first, second] = room.players;
    // Never start a match against an empty or disconnected seat.
    if (!second || first.socket === null || second.socket === null) {
      room.status = "WAITING";
      room.countdownEndsAt = null;
      broadcastRoom(room);
      return;
    }
    room.status = "PLAYING";
    room.countdownEndsAt = null;
    room.winner = null;
    first.game = createGame(room.seed);
    second.game = createGame(room.seed);
    log("match_started", { room: room.code });
    broadcastRoom(room);
    broadcastMatch(room);
  }

  function handleEvents(room: Room, playerId: 1 | 2, events: readonly GameEvent[]): void {
    const target = room.players[playerId === 1 ? 1 : 0];
    let attack = 0;
    let gameOver = false;
    for (const event of events) {
      if (event.type === "ATTACK") attack += event.lines;
      if (event.type === "GAME_OVER") gameOver = true;
    }
    if (attack > 0 && target?.game?.status === "playing") target.game = receiveGarbage(target.game, attack);
    if (events.length > 0) room.dirty = true;
    if (gameOver) finishMatch(room, playerId === 1 ? 2 : 1);
  }

  function handleInput(room: Room, player: PlayerSlot, action: PlayerAction): void {
    if (room.status !== "PLAYING" || !player.game || player.game.status !== "playing") return;
    const result = applyAction(player.game, action);
    player.game = result.state;
    handleEvents(room, player.playerId, result.events);
    // Mark dirty rather than broadcasting per key press; the tick loop sends
    // one update per tick, which caps traffic during key repeat.
    if (room.status === "PLAYING") room.dirty = true;
  }

  /** True when something a client can see differs between two states of the same player. */
  function visiblyChanged(before: GameState, after: GameState): boolean {
    const a = before.active;
    const b = after.active;
    return (
      before.board !== after.board ||
      before.status !== after.status ||
      before.score !== after.score ||
      before.pendingGarbage !== after.pendingGarbage ||
      before.hold !== after.hold ||
      before.queue !== after.queue ||
      a?.type !== b?.type ||
      a?.x !== b?.x ||
      a?.y !== b?.y ||
      a?.rotation !== b?.rotation
    );
  }

  // ------------------------------------------------------------- matchmaking

  function removeFromQueue(socket: WebSocket): boolean {
    const index = queue.findIndex((entry) => entry.socket === socket);
    if (index === -1) return false;
    queue.splice(index, 1);
    return true;
  }

  function quickMatch(socket: WebSocket, sessionId: string): void {
    leaveSeat(socket);
    removeFromQueue(socket);
    // A session can only wait once; a newer socket for the same session replaces the old entry.
    const stale = queue.findIndex((entry) => entry.sessionId === sessionId);
    if (stale !== -1) queue.splice(stale, 1);

    while (queue.length > 0) {
      const waiting = queue.shift()!;
      if (waiting.socket.readyState !== WebSocket.OPEN || socketSeats.has(waiting.socket)) continue;
      if (rooms.size >= MAX_ROOMS) {
        queue.unshift(waiting);
        return error(socket, "SERVER_BUSY", "The server is full right now. Try again in a moment.");
      }
      const room = createRoom(true, waiting.sessionId, waiting.socket);
      const guest = seatPlayer(room, sessionId, socket, true);
      if (!guest) return error(socket, "ROOM_ERROR", "Unable to start a match.");
      // Matched players skip the manual ready step so the match starts straight away.
      for (const player of room.players) if (player) player.ready = true;
      room.status = "READY_CHECK";
      log("quick_match_paired", { room: room.code });
      startCountdown(room);
      return;
    }

    queue.push({ socket, sessionId });
    log("quick_match_waiting", { waiting: queue.length });
    send(socket, queueState(socket));
    schedulePresence();
  }

  // -------------------------------------------------------- message handling

  function handleMessage(socket: WebSocket, message: ClientMessage): void {
    if (message.type === "QUICK_MATCH") return quickMatch(socket, message.sessionId);

    if (message.type === "CANCEL_QUICK_MATCH") {
      removeFromQueue(socket);
      send(socket, queueState(socket));
      schedulePresence();
      return;
    }

    if (message.type === "CREATE_ROOM") {
      if (rooms.size >= MAX_ROOMS) return error(socket, "SERVER_BUSY", "The server is full right now. Try again in a moment.");
      removeFromQueue(socket);
      leaveSeat(socket);
      const room = createRoom(false, message.sessionId, socket);
      broadcastRoom(room);
      return;
    }

    if (message.type === "JOIN_ROOM" || message.type === "RECONNECT") {
      removeFromQueue(socket);
      const room = rooms.get(message.roomCode);
      if (!room) return error(socket, "ROOM_NOT_FOUND", "That room is not available.");
      const current = socketSeats.get(socket);
      if (current && current.roomCode !== room.code) leaveSeat(socket);
      const player = seatPlayer(room, message.sessionId, socket, message.type === "JOIN_ROOM");
      if (!player) {
        return message.type === "RECONNECT"
          ? error(socket, "ROOM_NOT_FOUND", "Your seat in that room has expired.")
          : error(socket, "ROOM_FULL", "That room already has two players.");
      }
      if (room.status === "PLAYING" || room.status === "FINISHED") {
        broadcastRoom(room);
        broadcastMatch(room);
      } else {
        broadcastRoom(room);
      }
      return;
    }

    const seat = socketSeats.get(socket);
    if (!seat) return error(socket, "NOT_IN_ROOM", "Join a room before sending that action.");
    const room = rooms.get(seat.roomCode);
    const player = room ? room.players[seat.playerId - 1] : null;
    if (!room || !player) return error(socket, "ROOM_NOT_FOUND", "Your room is no longer available.");

    if (message.type === "INPUT") return handleInput(room, player, message.action);

    if (message.type === "READY") {
      if (room.status !== "WAITING" && room.status !== "READY_CHECK") return error(socket, "INVALID_STATE", "The match is already underway.");
      player.ready = message.ready;
      const everyoneReady = room.players[1] !== null && room.players.every((slot) => slot?.ready === true && slot.socket !== null);
      room.status = everyoneReady ? "READY_CHECK" : "WAITING";
      broadcastRoom(room);
      if (room.status === "READY_CHECK") startCountdown(room);
      return;
    }

    if (message.type === "REMATCH") {
      // Both players tend to click at once; a repeat click is not an error.
      if (room.status === "WAITING" || room.status === "READY_CHECK" || room.status === "COUNTDOWN") {
        send(socket, roomState(room, player.playerId));
        return;
      }
      if (room.status !== "FINISHED") return error(socket, "INVALID_STATE", "The match has not finished.");
      resetRoom(room);
      return;
    }

    if (message.type === "LEAVE") {
      leaveSeat(socket);
      send(socket, queueState(socket));
    }
  }

  function handleSocketClose(socket: WebSocket): void {
    removeFromQueue(socket);
    schedulePresence();
    buckets.delete(socket);
    alive.delete(socket);
    const seat = socketSeats.get(socket);
    if (!seat) return;
    socketSeats.delete(socket);
    const room = rooms.get(seat.roomCode);
    const player = room ? room.players[seat.playerId - 1] : null;
    if (!room || !player || player.socket !== socket) return;
    player.socket = null;
    player.disconnectedAt = Date.now();
    player.ready = false;
    // A lost player cancels a pending start instead of leaving the other one in a doomed countdown.
    if (room.status === "READY_CHECK" || room.status === "COUNTDOWN") {
      room.status = "WAITING";
      room.countdownEndsAt = null;
    }
    log("player_disconnected", { room: room.code, player: player.playerId });
    broadcastRoom(room);
  }

  /** Token bucket per socket. Returns false when the message should be dropped. */
  function allowMessage(socket: WebSocket): boolean {
    const now = Date.now();
    let bucket = buckets.get(socket);
    if (!bucket) {
      bucket = { tokens: RATE_BURST, last: now, strikes: 0 };
      buckets.set(socket, bucket);
    }
    bucket.tokens = Math.min(RATE_BURST, bucket.tokens + ((now - bucket.last) / 1000) * RATE_PER_SECOND);
    bucket.last = now;
    if (bucket.tokens < 1) {
      bucket.strikes += 1;
      if (bucket.strikes >= STRIKES_BEFORE_KICK) socket.close(1008, "Rate limit exceeded");
      return false;
    }
    bucket.tokens -= 1;
    return true;
  }

  function handleRawMessage(socket: WebSocket, raw: RawData): void {
    if (!allowMessage(socket)) return;
    try {
      const parsed: unknown = JSON.parse(raw.toString());
      const message = parseClientMessage(parsed);
      if (!message) return error(socket, "INVALID_MESSAGE", "That message is not valid.");
      handleMessage(socket, message);
    } catch {
      error(socket, "INVALID_MESSAGE", "That message is not valid JSON.");
    }
  }

  // ------------------------------------------------------------- server loop

  const httpServer = createServer((request: IncomingMessage, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      response.end(JSON.stringify({ status: "ok", rooms: rooms.size, playersOnline: websocketServer.clients.size, playersSearching: queue.length }));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  const websocketServer = new WebSocketServer({ server: httpServer, maxPayload: MAX_PAYLOAD_BYTES });
  websocketServer.on("connection", (socket) => {
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));
    socket.on("message", (raw) => handleRawMessage(socket, raw));
    socket.on("close", () => handleSocketClose(socket));
    socket.on("error", () => handleSocketClose(socket));
    send(socket, queueState(socket));
    schedulePresence();
  });

  function sweepRoom(room: Room, now: number): void {
    if (now - room.createdAt > ROOM_TTL_MS) {
      for (const player of room.players) player?.socket?.close(1000, "Room expired");
      deleteRoom(room);
      return;
    }

    for (const slot of room.players) {
      if (!slot || slot.departed || slot.disconnectedAt === null) continue;
      const grace = room.status === "PLAYING" ? DISCONNECT_GRACE_MS : LOBBY_GRACE_MS;
      if (now - slot.disconnectedAt <= grace) continue;
      if (room.status === "PLAYING") {
        forfeit(room, slot);
        slot.departed = true;
      } else if (room.status === "FINISHED") {
        slot.departed = true;
      } else {
        slot.departed = true;
        resetRoom(room);
        return;
      }
    }

    const nobodyHere = room.players.every((slot) => slot === null || slot.socket === null);
    if (nobodyHere && room.status !== "PLAYING") {
      const lastSeen = Math.max(...room.players.map((slot) => slot?.disconnectedAt ?? 0));
      if (now - lastSeen > LOBBY_GRACE_MS) deleteRoom(room);
    }
  }

  let lastStep = Date.now();
  const stepTimer = setInterval(() => {
    const now = Date.now();
    // Use real elapsed time so gravity stays correct if the host stalls briefly.
    const dt = Math.min(now - lastStep, MAX_TICK_DT_MS);
    lastStep = now;

    for (const room of [...rooms.values()]) {
      sweepRoom(room, now);
      if (!rooms.has(room.code)) continue;

      if (room.status === "COUNTDOWN" && room.countdownEndsAt !== null && now >= room.countdownEndsAt) startMatch(room);

      if (room.status === "PLAYING") {
        for (const player of room.players) {
          if (!player || room.status !== "PLAYING" || player.game?.status !== "playing") continue;
          const before = player.game;
          const result = tick(player.game, dt);
          player.game = result.state;
          if (visiblyChanged(before, result.state)) room.dirty = true;
          handleEvents(room, player.playerId, result.events);
        }
      }

      if (room.status === "PLAYING" || room.status === "FINISHED") {
        if (room.dirty) broadcastMatch(room);
      }
    }
  }, TICK_MS);

  const heartbeatTimer = setInterval(() => {
    for (const socket of websocketServer.clients) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, HEARTBEAT_MS);

  const presenceTimer = setInterval(broadcastPresence, PRESENCE_MS);

  return new Promise<RunningServer>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.port, () => {
      const address = httpServer.address();
      const port = typeof address === "object" && address ? address.port : config.port;
      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(stepTimer);
            clearInterval(heartbeatTimer);
            clearInterval(presenceTimer);
            if (presenceTimeout !== null) clearTimeout(presenceTimeout);
            for (const socket of websocketServer.clients) socket.terminate();
            websocketServer.close(() => httpServer.close(() => done()));
          }),
      });
    });
  });
}
