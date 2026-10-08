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
import { KEY_BINDINGS } from "../game/input";

interface OnlineBattleProps {
  onExit: () => void;
}

interface RoomState {
  roomCode: string;
  playerId: 1 | 2;
  players: readonly PlayerPresence[];
  status: RoomStatus;
  countdownEndsAt: number | null;
}

interface MatchState {
  player: SerializedPlayer;
  opponent: SerializedPlayer;
  winner: 1 | 2 | null;
  status: "playing" | "finished";
}

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "";

export function OnlineBattle({ onExit }: OnlineBattleProps) {
  const [connection, setConnection] = useState<"offline" | "connecting" | "connected">(
    serverUrl ? "offline" : "offline",
  );
  const [room, setRoom] = useState<RoomState | null>(null);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [clearFlash, setClearFlash] = useState(false);
  const clearFlashTimerRef = useRef<number | null>(null);
  const lastLinesRef = useRef<{ player: number | null; opponent: number | null }>({ player: null, opponent: null });
  const socketRef = useRef<WebSocket | null>(null);
  const sessionId = useMemo(() => getSessionId(), []);

  const send = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...message }));
    }
  }, []);

  const connect = useCallback(() => {
    if (!serverUrl) {
      setConnection("offline");
      return;
    }
    if (socketRef.current?.readyState === WebSocket.OPEN) return;
    setConnection("connecting");
    setErrorMessage(null);
    const socket = new WebSocket(serverUrl);
    socketRef.current = socket;
    socket.onopen = () => setConnection("connected");
    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const message: unknown = JSON.parse(event.data);
        handleServerMessage(message, setRoom, setMatch, setErrorMessage, setCountdown);
      } catch {
        setErrorMessage("The server sent an unreadable response.");
      }
    };
    socket.onerror = () => {
      setConnection("offline");
      setErrorMessage(null);
    };
    socket.onclose = () => setConnection("offline");
  }, []);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.close();
      if (clearFlashTimerRef.current !== null) window.clearTimeout(clearFlashTimerRef.current);
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

  useEffect(() => {
    const currentLines = match ? { player: match.player.lines, opponent: match.opponent.lines } : { player: null, opponent: null };
    const previous = lastLinesRef.current;
    const changed = match !== null && previous.player !== null && (match.player.lines > previous.player || match.opponent.lines > (previous.opponent ?? 0));
    lastLinesRef.current = currentLines;
    if (changed) {
      setClearFlash(true);
      if (clearFlashTimerRef.current !== null) window.clearTimeout(clearFlashTimerRef.current);
      clearFlashTimerRef.current = window.setTimeout(() => setClearFlash(false), 300);
    }
  }, [match]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!match || room?.status !== "PLAYING" || event.repeat) return;
      const action = KEY_BINDINGS[event.code];
      if (!action) return;
      event.preventDefault();
      send({ type: "INPUT", action, sequence: Date.now() });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [match, room?.status, send]);

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

  const serverConfigured = Boolean(serverUrl);

  if (!room) {
    return (
      <div className="screen landing-screen online-screen">
        <div className="online-panel">
          <Button variant="ghost" onClick={onExit}>{"\u2190"} BACK</Button>
          <h1 className="online-title">ONLINE BATTLE</h1>
          <p className="online-description">Create a room and invite another player, or join a room with a code.</p>
          <div className={`connection-pill connection-${connection}`}>
            <span className="status-icon">{connection === "connected" ? "\u25CF" : "\u25CB"}</span>
            {connection === "connected" ? "SERVER CONNECTED" : connection === "connecting" ? "CONNECTING" : "SERVER OFFLINE"}
          </div>
          {!serverConfigured && (
            <div className="server-warning">
              <p>The battle server is not configured yet. Online multiplayer requires a separate WebSocket server.</p>
              <p className="server-hint">Solo Play is always available from the main menu.</p>
            </div>
          )}
          <div className="online-actions">
            <Button variant="primary" size="lg" disabled={connection !== "connected"} onClick={createRoom}>CREATE ROOM</Button>
            <div className="join-row">
              <input
                className="room-input"
                value={roomInput}
                maxLength={6}
                onChange={(event) => setRoomInput(event.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                aria-label="Room code"
              />
              <Button variant="secondary" size="lg" disabled={connection !== "connected"} onClick={joinRoom}>JOIN</Button>
            </div>
          </div>
          {errorMessage && <p className="error-message">{errorMessage}</p>}
        </div>
      </div>
    );
  }

  if (!match || (room.status !== "PLAYING" && room.status !== "FINISHED")) {
    return <Lobby room={room} countdown={countdown} copied={copied} errorMessage={errorMessage} onCopy={copyRoom} onReady={ready} onLeave={leave} />;
  }

  const player = room.playerId === 1 ? match.player : match.opponent;
  const opponent = room.playerId === 1 ? match.opponent : match.player;
  const winner = match.winner;
  return (
    <div className="screen game-screen online-game">
      <header className="game-header">
        <Button variant="ghost" onClick={leave}>{"\u2190"} LEAVE</Button>
        <div className="game-status-tag">ROOM {room.roomCode}</div>
        <div className="connection-pill connection-connected">{"\u25CF"} CONNECTED</div>
      </header>
      <div className="online-layout">
        <div className="online-main-board">
          <div className="online-player-label">YOU {"\u00B7"} PLAYER {room.playerId}</div>
          <GameBoard board={toBoard(player.board)} activePiece={toActive(player.active)} ghostY={undefined} cellSize={30} clearFlash={clearFlash} />
          <div className="online-stats"><strong>{player.score.toLocaleString()}</strong><span>SCORE</span><strong>{player.lines}</strong><span>LINES</span><strong>{player.level}</strong><span>LEVEL</span></div>
        </div>
        <div className="online-opponent-column">
          <div className="online-player-label">OPPONENT {"\u00B7"} PLAYER {room.playerId === 1 ? 2 : 1}</div>
          <GameBoard board={toBoard(opponent.board)} activePiece={toActive(opponent.active)} cellSize={16} clearFlash={clearFlash} />
          <div className="online-opponent-stats"><span>{opponent.score.toLocaleString()} SCORE</span><span>{opponent.lines} LINES</span></div>
        </div>
        <aside className="online-side-panel"><HoldPanel hold={toPiece(player.hold)} /><NextQueue queue={player.queue.map(toPiece).filter(isPiece)} cellSize={12} /></aside>
      </div>
      <Modal open={winner !== null} dismissable={false}>
        <div className="result-modal">
          <h2 className="result-title">{winner === room.playerId ? "YOU WIN" : "YOU LOSE"}</h2>
          <p className="online-result-copy">Room {room.roomCode} has ended.</p>
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
        <Button variant="ghost" onClick={onLeave}>{"\u2190"} EXIT</Button>
        <span className="eyebrow">WAITING LOBBY</span>
        <h1 className="online-title">ROOM READY</h1>
        <button className="room-code" onClick={onCopy} aria-label="Copy room code">{room.roomCode}<span>{copied ? "COPIED" : "COPY CODE"}</span></button>
        <div className="lobby-players"><LobbyPlayer label={`PLAYER ${room.playerId}`} connected={self?.connected ?? false} ready={self?.ready ?? false} /><span className="vs-label">VS</span><LobbyPlayer label={opponent ? `PLAYER ${opponent.playerId}` : "PLAYER 2"} connected={opponent?.connected ?? false} ready={opponent?.ready ?? false} /></div>
        <Button variant={self?.ready ? "secondary" : "primary"} size="lg" disabled={!opponent?.connected || room.status === "COUNTDOWN"} onClick={() => onReady(!(self?.ready ?? false))}>{self?.ready ? "CANCEL READY" : "READY"}</Button>
        {countdown !== null && <div className="lobby-countdown">MATCH STARTING {"\u00B7"} {countdown}</div>}
        <p className="lobby-help">Share this code with the other player. Both players must be ready.</p>
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </div>
    </div>
  );
}

function LobbyPlayer({ label, connected, ready }: { label: string; connected: boolean; ready: boolean }) {
  return <div className="lobby-player"><strong>{label}</strong><span className={connected ? "state-good" : "state-muted"}>{connected ? (ready ? "READY" : "CONNECTED") : "WAITING"}</span></div>;
}

function getSessionId(): string {
  const key = "tetris-session-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, id);
  return id;
}

function handleServerMessage(value: unknown, setRoom: Dispatch<SetStateAction<RoomState | null>>, setMatch: Dispatch<SetStateAction<MatchState | null>>, setError: Dispatch<SetStateAction<string | null>>, setCountdown: Dispatch<SetStateAction<number | null>>): void {
  if (!value || typeof value !== "object") return;
  const message = value as Partial<ServerMessage>;
  if (message.type === "ERROR") {
    setError(message.message ?? "The server rejected that request.");
    return;
  }
  if (message.type === "ROOM_STATE" && message.roomCode && message.playerId && message.players && message.status) {
    setRoom({ roomCode: message.roomCode, playerId: message.playerId, players: message.players, status: message.status, countdownEndsAt: message.countdownEndsAt ?? null });
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
