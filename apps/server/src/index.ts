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

const PORT = Number(process.env.PORT ?? 8080);
const ROOM_TTL_MS = 60 * 60 * 1000;
const DISCONNECT_GRACE_MS = 10 * 1000;
const COUNTDOWN_MS = 3000;
const TICK_MS = 50;

interface PlayerSlot {
  readonly playerId: 1 | 2;
  sessionId: string;
  socket: WebSocket | null;
  ready: boolean;
  disconnectedAt: number | null;
  game: GameState | null;
}

interface Room {
  readonly code: string;
  readonly createdAt: number;
  status: RoomStatus;
  countdownEndsAt: number | null;
  seed: number;
  winner: 1 | 2 | null;
  players: [PlayerSlot, PlayerSlot | null];
}

const rooms = new Map<string, Room>();
const sessions = new Map<string, { roomCode: string; playerId: 1 | 2 }>();

function jsonMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

function send(socket: WebSocket | null, message: ServerMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(jsonMessage(message));
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
      connected: player.socket !== null,
      ready: player.ready,
    })),
    status: room.status,
    countdownEndsAt: room.countdownEndsAt,
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
  const first = room.players[0];
  const second = room.players[1];
  if (!first?.game || !second?.game) return;
  send(first.socket, {
    type: "MATCH_STATE",
    protocolVersion: PROTOCOL_VERSION,
    status: room.status === "FINISHED" ? "finished" : "playing",
    serverTime: Date.now(),
    player: serializeGame(first.game),
    opponent: serializeGame(second.game),
    winner: room.winner,
  });
  send(second.socket, {
    type: "MATCH_STATE",
    protocolVersion: PROTOCOL_VERSION,
    status: room.status === "FINISHED" ? "finished" : "playing",
    serverTime: Date.now(),
    player: serializeGame(second.game),
    opponent: serializeGame(first.game),
    winner: room.winner,
  });
}

function makeRoom(): Room {
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
    players: [{ playerId: 1, sessionId: "", socket: null, ready: false, disconnectedAt: null, game: null }, null],
  };
  rooms.set(code, room);
  return room;
}

function getPlayer(room: Room, playerId: 1 | 2): PlayerSlot | null {
  return room.players[playerId - 1];
}

function assignPlayer(room: Room, sessionId: string, socket: WebSocket): PlayerSlot | null {
  const existing = room.players.find((player) => player?.sessionId === sessionId);
  if (existing) {
    existing.socket = socket;
    existing.disconnectedAt = null;
    return existing;
  }
  if (room.players[0].sessionId === "") {
    room.players[0].sessionId = sessionId;
    room.players[0].socket = socket;
    sessions.set(sessionId, { roomCode: room.code, playerId: 1 });
    return room.players[0];
  }
  if (room.players[1] === null) {
    const player: PlayerSlot = { playerId: 2, sessionId, socket, ready: false, disconnectedAt: null, game: null };
    room.players[1] = player;
    sessions.set(sessionId, { roomCode: room.code, playerId: 2 });
    return player;
  }
  return null;
}

function startCountdown(room: Room): void {
  if (room.status !== "READY_CHECK") return;
  room.status = "COUNTDOWN";
  room.countdownEndsAt = Date.now() + COUNTDOWN_MS;
  broadcastRoom(room);
}

function startMatch(room: Room): void {
  room.status = "PLAYING";
  room.countdownEndsAt = null;
  room.winner = null;
  room.players[0].game = createGame(room.seed);
  if (room.players[1]) room.players[1].game = createGame(room.seed);
  broadcastRoom(room);
  broadcastMatch(room);
}

function handleEvents(room: Room, playerId: 1 | 2, events: readonly GameEvent[]): void {
  const target = getPlayer(room, playerId === 1 ? 2 : 1);
  let attack = 0;
  let gameOver = false;
  for (const event of events) {
    if (event.type === "ATTACK") attack += event.lines;
    if (event.type === "GAME_OVER") gameOver = true;
  }
  if (attack > 0 && target?.game?.status === "playing") target.game = receiveGarbage(target.game, attack);
  if (gameOver && room.winner === null) {
    room.winner = playerId === 1 ? 2 : 1;
    room.status = "FINISHED";
  }
}

function handleInput(room: Room, player: PlayerSlot, action: PlayerAction): void {
  if (room.status !== "PLAYING" || !player.game || player.game.status !== "playing") return;
  const result = applyAction(player.game, action);
  player.game = result.state;
  handleEvents(room, player.playerId, result.events);
  broadcastMatch(room);
}

function handleMessage(socket: WebSocket, message: ClientMessage): void {
  if (message.type === "CREATE_ROOM") {
    const room = makeRoom();
    const player = assignPlayer(room, message.sessionId, socket);
    if (!player) return error(socket, "ROOM_ERROR", "Unable to create a room.");
    broadcastRoom(room);
    return;
  }

  if (message.type === "JOIN_ROOM" || message.type === "RECONNECT") {
    const room = rooms.get(message.roomCode);
    if (!room) return error(socket, "ROOM_NOT_FOUND", "That room is not available.");
    const player = assignPlayer(room, message.sessionId, socket);
    if (!player) return error(socket, "ROOM_FULL", "That room already has two players.");
    send(socket, roomState(room, player.playerId));
    if (room.status === "PLAYING" || room.status === "FINISHED") broadcastMatch(room);
    else broadcastRoom(room);
    return;
  }

  const session = findSessionForSocket(socket);
  if (!session) return error(socket, "NOT_IN_ROOM", "Join a room before sending that action.");
  const room = rooms.get(session.roomCode);
  const player = room ? getPlayer(room, session.playerId) : null;
  if (!room || !player) return error(socket, "ROOM_NOT_FOUND", "Your room is no longer available.");

  if (message.type === "READY") {
    if (room.status !== "WAITING" && room.status !== "READY_CHECK") return error(socket, "INVALID_STATE", "The match is already underway.");
    player.ready = message.ready;
    room.status = room.players[1] && room.players.every((slot) => slot?.ready === true) ? "READY_CHECK" : "WAITING";
    broadcastRoom(room);
    if (room.status === "READY_CHECK") startCountdown(room);
    return;
  }

  if (message.type === "INPUT") return handleInput(room, player, message.action);

  if (message.type === "REMATCH") {
    if (room.status !== "FINISHED") return error(socket, "INVALID_STATE", "The match has not finished.");
    for (const slot of room.players) {
      if (slot) { slot.ready = false; slot.game = null; }
    }
    room.seed = randomInt(0, 0x7fffffff);
    room.winner = null;
    room.status = "WAITING";
    broadcastRoom(room);
    return;
  }

  if (message.type === "LEAVE") {
    disconnectPlayer(room, player);
  }
}

function findSessionForSocket(socket: WebSocket): { roomCode: string; playerId: 1 | 2 } | null {
  for (const [sessionId, session] of sessions) {
    const room = rooms.get(session.roomCode);
    const player = room ? getPlayer(room, session.playerId) : null;
    if (player?.socket === socket) return session;
    if (!player) sessions.delete(sessionId);
  }
  return null;
}

function disconnectPlayer(room: Room, player: PlayerSlot): void {
  player.socket = null;
  player.disconnectedAt = Date.now();
  player.ready = false;
  if (room.status === "PLAYING") broadcastRoom(room);
  else if (room.status !== "FINISHED") broadcastRoom(room);
}

function handleSocketClose(socket: WebSocket): void {
  const session = findSessionForSocket(socket);
  if (!session) return;
  const room = rooms.get(session.roomCode);
  const player = room ? getPlayer(room, session.playerId) : null;
  if (room && player) disconnectPlayer(room, player);
}

function handleRawMessage(socket: WebSocket, raw: RawData): void {
  try {
    const parsed: unknown = JSON.parse(raw.toString());
    const message = parseClientMessage(parsed);
    if (!message) return error(socket, "INVALID_MESSAGE", "That message is not valid.");
    handleMessage(socket, message);
  } catch {
    error(socket, "INVALID_MESSAGE", "That message is not valid JSON.");
  }
}

const httpServer = createServer((request: IncomingMessage, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    response.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
    return;
  }
  response.writeHead(404);
  response.end();
});

const websocketServer = new WebSocketServer({ server: httpServer });
websocketServer.on("connection", (socket) => {
  socket.on("message", (raw) => handleRawMessage(socket, raw));
  socket.on("close", () => handleSocketClose(socket));
  socket.on("error", () => handleSocketClose(socket));
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      for (const player of room.players) player?.socket?.close(1000, "Room expired");
      rooms.delete(code);
      continue;
    }
    if (room.status === "COUNTDOWN" && room.countdownEndsAt !== null && now >= room.countdownEndsAt) startMatch(room);
    if (room.status === "PLAYING") {
      for (const player of room.players) {
        if (!player) continue;
        if (player.disconnectedAt !== null && now - player.disconnectedAt > DISCONNECT_GRACE_MS) {
          room.winner = player.playerId === 1 ? 2 : 1;
          room.status = "FINISHED";
          player.game = player.game ? { ...player.game, status: "gameover", gameOverReason: "BLOCK_OUT", active: null } : null;
          break;
        }
        if (player.game?.status === "playing") {
          const result = tick(player.game, TICK_MS);
          player.game = result.state;
          handleEvents(room, player.playerId, result.events);
        }
      }
      broadcastMatch(room);
      if (room.status === "FINISHED") broadcastRoom(room);
    }
  }
}, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`Tetris server listening on port ${PORT}`);
});
