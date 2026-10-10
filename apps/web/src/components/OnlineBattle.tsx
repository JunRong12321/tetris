import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  type ActivePiece,
  type Board,
  type Cell,
  type PieceType,
  type Rotation,
} from "@tetris/game-engine";
import {
  PROTOCOL_VERSION,
  type PlayerPresence,
  type RoomStatus,
  type SerializedPlayer,
  type ServerMessage,
} from "@tetris/protocol";
import { GameBoard } from "./GameBoard";
import { HoldPanel } from "./HoldPanel";
import { NextQueue } from "./NextQueue";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { InputHandler } from "../game/input";
import { ghostY } from "../game/ghost";
import { resolveServerUrl, serverConfigMessage } from "../game/serverUrl";
import { MAX_RECONNECT_ATTEMPTS, nextReconnectDelay } from "../game/reconnect";

interface OnlineBattleProps {
  onExit: () => void;
}

interface RoomState {
  roomCode: string;
  playerId: 1 | 2;
  players: readonly PlayerPresence[];
  status: RoomStatus;
  countdownEndsAt: number | null;
  quickMatch: boolean;
}

interface QueueInfo {
  searching: boolean;
  /** null until the server has told us. Includes this player. */
  playersOnline: number | null;
  playersSearching: number;
}

/** Close code the server uses when the same session connects from another tab. */
const CLOSE_REPLACED = 4000;

interface MatchState {
  player: SerializedPlayer;
  opponent: SerializedPlayer;
  winner: 1 | 2 | null;
  status: "playing" | "finished";
}

const serverTarget = resolveServerUrl(import.meta.env.VITE_SERVER_URL, window.location.protocol, import.meta.env.DEV);

export function OnlineBattle({ onExit }: OnlineBattleProps) {
  const [connection, setConnection] = useState<"offline" | "connecting" | "connected" | "retrying">("offline");
  const [attempt, setAttempt] = useState(0);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [queue, setQueue] = useState<QueueInfo>({ searching: false, playersOnline: null, playersSearching: 0 });
  const [countdown, setCountdown] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const sequenceRef = useRef(0);
  const roomCodeRef = useRef<string | null>(null);
  const searchingRef = useRef(false);
  const sessionId = useMemo(() => getSessionId(), []);

  const send = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...message }));
    }
  }, []);

  const connect = useCallback(function openSocket(): void {
    if (!serverTarget.ok) return;
    const current = socketRef.current;
    if (current?.readyState === WebSocket.OPEN || current?.readyState === WebSocket.CONNECTING) return;
    setConnection("connecting");
    setErrorMessage(null);
    const socket = new WebSocket(serverTarget.url);
    socketRef.current = socket;
    socket.onopen = () => {
      if (socketRef.current !== socket) return;
      attemptRef.current = 0;
      setAttempt(0);
      setConnection("connected");
      // If we were in a room before the drop, rejoin it. The server keeps the
      // seat for a grace period and matches us by session ID.
      const roomCode = roomCodeRef.current;
      if (roomCode) {
        socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, type: "RECONNECT", roomCode, sessionId }));
      } else if (searchingRef.current) {
        // The server forgets the queue when a socket drops, so rejoin it.
        socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, type: "QUICK_MATCH", sessionId }));
      }
    };
    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const message: unknown = JSON.parse(event.data);
        handleServerMessage(message, setRoom, setMatch, setErrorMessage, setCountdown, setQueue);
      } catch {
        setErrorMessage("The server sent an unreadable response.");
      }
    };
    socket.onclose = (event: CloseEvent) => {
      // Ignore closes from sockets that were replaced or cleaned up.
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      if (event.code === CLOSE_REPLACED) {
        // Another tab took over this session. Reconnecting would just kick that tab back out.
        setConnection("offline");
        setQueue((current) => ({ ...current, searching: false }));
        setErrorMessage("Online Battle is open in another tab. Close it, then press retry.");
        return;
      }
      const next = attemptRef.current + 1;
      attemptRef.current = next;
      setAttempt(next);
      if (next > MAX_RECONNECT_ATTEMPTS) {
        setConnection("offline");
        setErrorMessage("The battle server did not respond. It may be waking up. Try again in a minute.");
        return;
      }
      setConnection("retrying");
      retryTimerRef.current = window.setTimeout(openSocket, nextReconnectDelay(next));
    };
  }, [sessionId]);

  useEffect(() => {
    roomCodeRef.current = room?.roomCode ?? null;
  }, [room?.roomCode]);

  useEffect(() => {
    searchingRef.current = queue.searching;
  }, [queue.searching]);

  const retryNow = () => {
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    attemptRef.current = 0;
    setAttempt(0);
    connect();
  };

  useEffect(() => {
    connect();
    return () => {
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [connect]);

  useEffect(() => {
    if (!room?.countdownEndsAt || room.status !== "COUNTDOWN") {
      setCountdown(null);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, room.countdownEndsAt! - Date.now());
      setCountdown(remaining === 0 ? null : Math.ceil(remaining / 1000));
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [room?.countdownEndsAt, room?.status]);

  const inMatch = match !== null && room?.status === "PLAYING";
  useEffect(() => {
    if (!inMatch) return;
    // Same input handler as solo play, so holding a key repeats movement.
    const handler = new InputHandler();
    handler.attach(
      (action) => {
        sequenceRef.current += 1;
        send({ type: "INPUT", action, sequence: sequenceRef.current });
      },
      () => undefined,
    );
    const release = () => handler.releaseAll();
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("blur", release);
      handler.detach();
    };
  }, [inMatch, send]);

  const quickMatch = () => {
    setErrorMessage(null);
    searchingRef.current = true;
    setQueue((current) => ({ ...current, searching: true }));
    send({ type: "QUICK_MATCH", sessionId });
  };
  const cancelSearch = () => {
    searchingRef.current = false;
    setQueue((current) => ({ ...current, searching: false }));
    send({ type: "CANCEL_QUICK_MATCH" });
  };
  const createRoom = () => send({ type: "CREATE_ROOM", sessionId });
  const joinRoom = () => {
    const code = roomInput.trim().toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(code)) send({ type: "JOIN_ROOM", roomCode: code, sessionId });
    else setErrorMessage("Enter the six-character room code.");
  };
  const leave = () => {
    send({ type: "LEAVE" });
    setRoom(null);
    setMatch(null);
  };
  const rematch = () => send({ type: "REMATCH" });
  const ready = (value: boolean) => send({ type: "READY", ready: value });
  const copyRoom = async () => {
    if (!room) return;
    await navigator.clipboard.writeText(room.roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (!room) {
    const connected = connection === "connected";
    return (
      <div className="screen landing-screen online-screen">
        <div className="online-panel">
          <Button variant="ghost" onClick={onExit}>← BACK</Button>
          <h1 className="online-title">ONLINE BATTLE</h1>
          <p className="online-description">Get matched with another player who is online right now, or invite a friend with a room code.</p>
          <div className={`connection-pill connection-${connection === "retrying" ? "connecting" : connection}`}>
            <span className="status-icon">{connected ? "●" : "○"}</span>
            {connected
              ? "SERVER CONNECTED"
              : connection === "connecting"
                ? "CONNECTING"
                : connection === "retrying"
                  ? `SERVER WAKING · ${attempt}/${MAX_RECONNECT_ATTEMPTS}`
                  : "SERVER OFFLINE"}
          </div>
          {connected && queue.playersOnline !== null && (
            <p className="online-count" role="status">
              {queue.playersOnline} {queue.playersOnline === 1 ? "PLAYER" : "PLAYERS"} ONLINE
              {queue.playersSearching > 0 ? ` · ${queue.playersSearching} SEARCHING` : ""}
            </p>
          )}
          {connection === "retrying" && (
            <p className="lobby-help">The free server sleeps when idle. Waking it up takes about a minute.</p>
          )}
          {!serverTarget.ok && <p className="error-message">{serverConfigMessage(serverTarget.reason)}</p>}
          {connection === "offline" && serverTarget.ok && (
            <Button variant="ghost" onClick={retryNow}>RETRY CONNECTION</Button>
          )}
          {queue.searching ? (
            <div className="online-actions" role="status" aria-live="polite">
              <div className="search-status"><span className="search-spinner" aria-hidden="true" />SEARCHING FOR AN OPPONENT</div>
              <p className="lobby-help">
                {queue.playersOnline !== null && queue.playersOnline <= 1
                  ? "No one else is online yet. Keep this tab open and you will be matched as soon as another player joins."
                  : "Keep this tab open. The match starts as soon as an opponent is found."}
              </p>
              <Button variant="secondary" size="lg" onClick={cancelSearch}>CANCEL SEARCH</Button>
            </div>
          ) : (
            <div className="online-actions">
              <Button variant="primary" size="lg" disabled={!connected} onClick={quickMatch}>QUICK MATCH</Button>
              <div className="online-divider"><span>OR PLAY WITH A FRIEND</span></div>
              <Button variant="secondary" size="lg" disabled={!connected} onClick={createRoom}>CREATE ROOM</Button>
              <div className="join-row">
                <input
                  className="room-input"
                  value={roomInput}
                  maxLength={6}
                  onChange={(event) => setRoomInput(event.target.value.toUpperCase())}
                  placeholder="ROOM CODE"
                  aria-label="Room code"
                />
                <Button variant="secondary" size="lg" disabled={!connected} onClick={joinRoom}>JOIN</Button>
              </div>
            </div>
          )}
          {errorMessage && <p className="error-message" role="alert">{errorMessage}</p>}
        </div>
      </div>
    );
  }

  if (!match || room.status !== "PLAYING" && room.status !== "FINISHED") {
    return <Lobby room={room} countdown={countdown} copied={copied} errorMessage={errorMessage} onCopy={copyRoom} onReady={ready} onLeave={leave} />;
  }

  const player = room.playerId === 1 ? match.player : match.opponent;
  const opponent = room.playerId === 1 ? match.opponent : match.player;
  const winner = match.winner;
  const playerBoard = toBoard(player.board);
  const playerActive = toActive(player.active);
  const landingRow = playerActive ? ghostY(playerBoard, playerActive) : undefined;
  const opponentSeat = room.players.find((seat) => seat.playerId !== room.playerId);
  const opponentAway = room.status === "PLAYING" && opponentSeat !== undefined && !opponentSeat.connected;
  const connectionLabel = connection === "connected" ? "● CONNECTED" : connection === "offline" ? "○ OFFLINE" : "○ RECONNECTING";
  return (
    <div className="screen game-screen online-game">
      <header className="game-header">
        <Button variant="ghost" onClick={leave}>← LEAVE</Button>
        <div className="game-status-tag">{room.quickMatch ? "QUICK MATCH" : `ROOM ${room.roomCode}`}</div>
        <div className={`connection-pill connection-${connection === "retrying" ? "connecting" : connection}`}>{connectionLabel}</div>
      </header>
      {connection !== "connected" && room.status === "PLAYING" && (
        <div className="match-banner" role="alert">CONNECTION LOST · RECONNECTING</div>
      )}
      {connection === "connected" && opponentAway && (
        <div className="match-banner" role="alert">OPPONENT DISCONNECTED · WAITING FOR THEM TO RECONNECT</div>
      )}
      <div className="online-layout">
        <div className="online-main-board">
          <div className="online-player-label">YOU · PLAYER {room.playerId}</div>
          <GameBoard board={playerBoard} activePiece={playerActive} ghostY={landingRow} cellSize={30} />
          <div className="online-stats"><strong>{player.score.toLocaleString()}</strong><span>SCORE</span><strong>{player.lines}</strong><span>LINES</span><strong>{player.level}</strong><span>LEVEL</span></div>
          {player.pendingGarbage > 0 && <div className="incoming-garbage" role="status">⚠ INCOMING +{player.pendingGarbage}</div>}
        </div>
        <div className="online-opponent-column">
          <div className="online-player-label">OPPONENT · PLAYER {room.playerId === 1 ? 2 : 1}</div>
          <GameBoard board={toBoard(opponent.board)} activePiece={toActive(opponent.active)} cellSize={16} />
          <div className="online-opponent-stats"><span>{opponent.score.toLocaleString()} SCORE</span><span>{opponent.lines} LINES</span></div>
        </div>
        <aside className="online-side-panel"><HoldPanel hold={toPiece(player.hold)} /><NextQueue queue={player.queue.map(toPiece).filter(isPiece)} cellSize={12} /></aside>
      </div>
      <Modal open={winner !== null} dismissable={false}>
        <div className="result-modal">
          <h2 className="result-title">{winner === room.playerId ? "YOU WIN" : "YOU LOSE"}</h2>
          <p className="online-result-copy">{room.quickMatch ? "Quick match finished." : `Room ${room.roomCode} has ended.`}</p>
          <div className="result-actions"><Button variant="primary" onClick={rematch}>REMATCH</Button><Button variant="secondary" onClick={leave}>EXIT TO LOBBY</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function Lobby({ room, countdown, copied, errorMessage, onCopy, onReady, onLeave }: { room: RoomState; countdown: number | null; copied: boolean; errorMessage: string | null; onCopy: () => void; onReady: (ready: boolean) => void; onLeave: () => void }) {
  const self = room.players.find((player) => player.playerId === room.playerId);
  const opponent = room.players.find((player) => player.playerId !== room.playerId);
  return (
    <div className="screen landing-screen online-screen">
      <div className="online-panel lobby-panel">
        <Button variant="ghost" onClick={onLeave}>← EXIT</Button>
        <span className="eyebrow">{room.quickMatch ? "QUICK MATCH" : "WAITING LOBBY"}</span>
        <h1 className="online-title">{room.quickMatch ? "OPPONENT FOUND" : "ROOM READY"}</h1>
        {!room.quickMatch && (
          <button className="room-code" onClick={onCopy} aria-label="Copy room code">{room.roomCode}<span>{copied ? "COPIED" : "COPY CODE"}</span></button>
        )}
        <div className="lobby-players"><LobbyPlayer label={`PLAYER ${room.playerId}`} connected={self?.connected ?? false} ready={self?.ready ?? false} /><span className="vs-label">VS</span><LobbyPlayer label={opponent ? `PLAYER ${opponent.playerId}` : "PLAYER 2"} connected={opponent?.connected ?? false} ready={opponent?.ready ?? false} /></div>
        <Button variant={self?.ready ? "secondary" : "primary"} size="lg" disabled={!opponent?.connected || room.status === "COUNTDOWN"} onClick={() => onReady(!(self?.ready ?? false))}>{self?.ready ? "CANCEL READY" : "READY"}</Button>
        {countdown !== null && <div className="lobby-countdown">MATCH STARTING · {countdown}</div>}
        <p className="lobby-help">{room.quickMatch ? "You were matched automatically. The game starts when the countdown ends." : "Share this code with the other player. Both players must be ready."}</p>
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </div>
    </div>
  );
}

function LobbyPlayer({ label, connected, ready }: { label: string; connected: boolean; ready: boolean }) {
  return <div className="lobby-player"><strong>{label}</strong><span className={connected ? "state-good" : "state-muted"}>{connected ? (ready ? "READY" : "CONNECTED") : "WAITING"}</span></div>;
}

function getSessionId(): string {
  // sessionStorage, not localStorage: a refresh keeps the seat, but a second tab
  // is a second player. (With localStorage both tabs shared one identity, so a
  // player could never face their own second tab.)
  const key = "tetris-session-id";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const id = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  window.sessionStorage.setItem(key, id);
  return id;
}

function handleServerMessage(value: unknown, setRoom: Dispatch<SetStateAction<RoomState | null>>, setMatch: Dispatch<SetStateAction<MatchState | null>>, setError: Dispatch<SetStateAction<string | null>>, setCountdown: Dispatch<SetStateAction<number | null>>, setQueue: Dispatch<SetStateAction<QueueInfo>>): void {
  if (!value || typeof value !== "object") return;
  const message = value as Partial<ServerMessage>;
  if (message.type === "ERROR") {
    // The room expired or was closed while we were away: return to the lobby.
    if (message.code === "ROOM_NOT_FOUND") {
      setRoom(null);
      setMatch(null);
    }
    setError(message.message ?? "The server rejected that request.");
    return;
  }
  if (message.type === "QUEUE_STATE") {
    setQueue({ searching: message.searching === true, playersOnline: message.playersOnline ?? null, playersSearching: message.playersSearching ?? 0 });
    return;
  }
  if (message.type === "ROOM_STATE" && message.roomCode && message.playerId && message.players && message.status) {
    setQueue((current) => (current.searching ? { ...current, searching: false } : current));
    setRoom({ roomCode: message.roomCode, playerId: message.playerId, players: message.players, status: message.status, countdownEndsAt: message.countdownEndsAt ?? null, quickMatch: message.quickMatch === true });
    if (message.status === "WAITING" || message.status === "READY_CHECK" || message.status === "COUNTDOWN") setMatch(null);
    return;
  }
  if (message.type === "MATCH_STATE" && message.player && message.opponent) {
    setMatch({ player: message.player, opponent: message.opponent, winner: message.winner ?? null, status: message.status ?? "playing" });
    if (message.status === "finished") setCountdown(null);
  }
}

function toBoard(rows: readonly (readonly (string | null)[])[]): Board {
  return rows.map((row) => row.map((cell): Cell => cell === "G" || isPiece(cell) ? cell : null));
}

function toActive(active: SerializedPlayer["active"]): ActivePiece | null {
  if (!active || !isPiece(active.type) || ![0, 1, 2, 3].includes(active.rotation)) return null;
  return { type: active.type, x: active.x, y: active.y, rotation: active.rotation as Rotation };
}

function toPiece(value: string | null): PieceType | null {
  return isPiece(value) ? value : null;
}

function isPiece(value: string | null | undefined): value is PieceType {
  return value === "I" || value === "O" || value === "T" || value === "S" || value === "Z" || value === "J" || value === "L";
}
