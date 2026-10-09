import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyAction,
  createGame,
  getGhostPiece,
  getRenderBoard,
  receiveGarbage,
  tick,
  type ActivePiece,
  type Board,
  type Cell,
  type GameState,
  type PieceType,
  type PlayerAction,
  type Rotation,
} from "@tetris/game-engine";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { GameBoard } from "./GameBoard";
import { HoldPanel } from "./HoldPanel";
import { NextQueue } from "./NextQueue";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { InputHandler } from "../game/input";

interface OnlineBattleProps {
  onExit: () => void;
}

type RoomStatus = "waiting" | "countdown" | "playing" | "finished";

interface RoomData {
  code: string;
  seed: number;
  status: RoomStatus;
  p1_session: string;
  p1_ready: boolean;
  p2_session: string | null;
  p2_ready: boolean;
  winner: number | null;
}

type PlayerId = 1 | 2;

interface OpponentSnapshot {
  board: string[][];
  active: { type: string; x: number; y: number; rotation: number } | null;
  hold: string | null;
  queue: string[];
  score: number;
  lines: number;
  level: number;
  gameOverReason: string | null;
}

interface BroadcastMessage {
  type: "garbage" | "gameover" | "snapshot" | "rematch";
  lines?: number;
  winner?: PlayerId;
  snapshot?: OpponentSnapshot;
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getSessionId(): string {
  const key = "tetris-session-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, id);
  return id;
}

const COUNTDOWN_MS = 3000;

export function OnlineBattle({ onExit }: OnlineBattleProps) {
  const sessionId = useMemo(() => getSessionId(), []);

  const [view, setView] = useState<"menu" | "lobby" | "game">("menu");
  const [roomCode, setRoomCode] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [seed, setSeed] = useState(0);
  const [playerId, setPlayerId] = useState<PlayerId>(1);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // game state (local authoritative for your own board)
  const [gameState, setGameState] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const [opponent, setOpponent] = useState<OpponentSnapshot | null>(null);
  const [winner, setWinner] = useState<PlayerId | null>(null);
  const [clearFlash, setClearFlash] = useState(false);
  const [clearLabel, setClearLabel] = useState<string | null>(null);
  const clearFlashTimerRef = useRef<number | null>(null);
  const clearLabelTimerRef = useRef<number | null>(null);

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const inputRef = useRef<InputHandler>(new InputHandler());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingGarbageRef = useRef<number>(0);
  const gameOverSentRef = useRef(false);

  const updateState = useCallback((next: GameState) => {
    const previous = stateRef.current;
    if (previous && next.lines > previous.lines) {
      const cleared = next.lines - previous.lines;
      setClearFlash(true);
      const labels: Record<number, string> = { 1: "SINGLE", 2: "DOUBLE", 3: "TRIPLE", 4: "TETRIS!" };
      setClearLabel(labels[cleared] ?? null);
      if (clearFlashTimerRef.current !== null) window.clearTimeout(clearFlashTimerRef.current);
      clearFlashTimerRef.current = window.setTimeout(() => setClearFlash(false), 300);
      if (clearLabelTimerRef.current !== null) window.clearTimeout(clearLabelTimerRef.current);
      clearLabelTimerRef.current = window.setTimeout(() => setClearLabel(null), cleared >= 4 ? 1200 : 800);
    }
    stateRef.current = next;
    setGameState(next);
  }, []);

  const sendSnapshot = useCallback((state: GameState) => {
    const channel = channelRef.current;
    if (!channel) return;
    const boardStr = state.board.map((row) => row.map((c): string => c ?? ""));
    const snapshot: OpponentSnapshot = {
      board: boardStr,
      active: state.active
        ? { type: state.active.type, x: state.active.x, y: state.active.y, rotation: state.active.rotation }
        : null,
      hold: state.hold,
      queue: [...state.queue],
      score: state.score,
      lines: state.lines,
      level: state.level,
      gameOverReason: state.status === "gameover" ? state.gameOverReason ?? "" : null,
    };
    channel.send({
      type: "broadcast",
      event: "msg",
      payload: { type: "snapshot", snapshot } as BroadcastMessage,
    });
  }, []);

  // Game loop
  useEffect(() => {
    const loop = (now: number) => {
      const current = stateRef.current;
      if (current && current.status === "playing") {
        const dt = now - lastTimeRef.current;
        lastTimeRef.current = now;
        if (dt > 0 && dt < 1000) {
          const { state: next } = tick(current, dt);
          if (next !== current) updateState(next);
        }
      } else {
        lastTimeRef.current = now;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (clearFlashTimerRef.current !== null) window.clearTimeout(clearFlashTimerRef.current);
      if (clearLabelTimerRef.current !== null) window.clearTimeout(clearLabelTimerRef.current);
    };
  }, [updateState]);

  // Send snapshot when our game state changes
  useEffect(() => {
    if (gameState && view === "game") {
      sendSnapshot(gameState);
    }
  }, [gameState, view, sendSnapshot]);

  // Input handler
  useEffect(() => {
    if (view !== "game") return;
    const handler = inputRef.current;
    handler.attach(
      (action: PlayerAction) => {
        const current = stateRef.current;
        if (!current || current.status !== "playing") return;

        let working = current;
        if (pendingGarbageRef.current > 0) {
          working = receiveGarbage(working, pendingGarbageRef.current);
          pendingGarbageRef.current = 0;
        }

        const { state: next } = applyAction(working, action);
        updateState(next);

        // Check for ATTACK events to send to opponent
        const prevGarbageSent = current.garbageSent;
        if (next.garbageSent > prevGarbageSent) {
          const attackLines = next.garbageSent - prevGarbageSent;
          channelRef.current?.send({
            type: "broadcast",
            event: "msg",
            payload: { type: "garbage", lines: attackLines } as BroadcastMessage,
          });
        }

        // Check for game over
        if (next.status === "gameover" && !gameOverSentRef.current) {
          gameOverSentRef.current = true;
          channelRef.current?.send({
            type: "broadcast",
            event: "msg",
            payload: { type: "gameover", winner: (playerId === 1 ? 2 : 1) as PlayerId } as BroadcastMessage,
          });
          setWinner((playerId === 1 ? 2 : 1) as PlayerId);
        }
      },
      () => {},
    );
    return () => handler.detach();
  }, [view, playerId, updateState]);

  // Countdown effect
  useEffect(() => {
    if (view !== "lobby" || room?.status !== "countdown") {
      setCountdown(null);
      return;
    }
    const startTime = Date.now();
    const update = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, COUNTDOWN_MS - elapsed);
      if (remaining === 0) {
        setCountdown(null);
        startMatch();
        return;
      }
      setCountdown(Math.ceil(remaining / 1000));
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [view, room?.status]);

  const startMatch = useCallback(() => {
    setView("game");
    gameOverSentRef.current = false;
    pendingGarbageRef.current = 0;
    const game = createGame(seed, { startLevel: 1 });
    stateRef.current = game;
    setGameState(game);
    setOpponent(null);
    setWinner(null);
  }, [seed]);

  // Subscribe to realtime channel when room is created/joined
  const subscribeChannel = useCallback(
    (code: string) => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      const channel = supabase.channel(`room:${code}`);
      channel
        .on("broadcast", { event: "msg" }, ({ payload }: { payload: BroadcastMessage }) => {
          if (payload.type === "garbage" && payload.lines) {
            pendingGarbageRef.current += payload.lines;
          } else if (payload.type === "gameover" && payload.winner) {
            setWinner(payload.winner);
          } else if (payload.type === "snapshot" && payload.snapshot) {
            setOpponent(payload.snapshot);
          } else if (payload.type === "rematch") {
            setWinner(null);
            setGameState(null);
            stateRef.current = null;
            setOpponent(null);
            gameOverSentRef.current = false;
            pendingGarbageRef.current = 0;
            setView("lobby");
          }
        })
        .on<RoomData>("postgres_changes",
          { event: "*", schema: "public", table: "mp_rooms", filter: `code=eq.${code}` },
          (payload) => {
            const data = payload.new as RoomData;
            if (data) {
              setRoom(data);
              if (data.seed) setSeed(data.seed);
            }
          },
        )
        .subscribe();
      channelRef.current = channel;
    },
    [],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      inputRef.current.detach();
    };
  }, []);

  // Create room
  const createRoom = useCallback(async () => {
    setErrorMessage(null);
    const code = generateRoomCode();
    const roomSeed = Math.floor(Math.random() * 1e9);
    try {
      const { error } = await supabase.from("mp_rooms").insert({
        code,
        seed: roomSeed,
        p1_session: sessionId,
        status: "waiting",
      });
      if (error) {
        setErrorMessage("Could not create room. Please try again.");
        return;
      }
      setRoomCode(code);
      setSeed(roomSeed);
      setPlayerId(1);
      setView("lobby");
      subscribeChannel(code);

      // Poll for our room data
      const { data } = await supabase.from("mp_rooms").select("*").eq("code", code).maybeSingle();
      if (data) setRoom(data as RoomData);
    } catch {
      setErrorMessage("Network error. Please try again.");
    }
  }, [sessionId, subscribeChannel]);

  // Join room
  const joinRoom = useCallback(async () => {
    const code = roomInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setErrorMessage("Enter the six-character room code.");
      return;
    }
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from("mp_rooms")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (error || !data) {
        setErrorMessage("Room not found. Check the code and try again.");
        return;
      }

      const roomData = data as RoomData;
      if (roomData.p2_session && roomData.p2_session !== sessionId) {
        setErrorMessage("This room is already full.");
        return;
      }

      // Join as player 2
      const { error: updateError } = await supabase
        .from("mp_rooms")
        .update({ p2_session: sessionId, updated_at: new Date().toISOString() })
        .eq("code", code);

      if (updateError) {
        setErrorMessage("Could not join room. Please try again.");
        return;
      }

      setRoomCode(code);
      setSeed(roomData.seed);
      setPlayerId(2);
      setView("lobby");
      subscribeChannel(code);
      setRoom({ ...roomData, p2_session: sessionId });
    } catch {
      setErrorMessage("Network error. Please try again.");
    }
  }, [roomInput, sessionId, subscribeChannel]);

  // Toggle ready
  const toggleReady = useCallback(async () => {
    if (!room) return;
    const isP1 = room.p1_session === sessionId;
    const newReady = isP1 ? !room.p1_ready : !room.p2_ready;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    updates[isP1 ? "p1_ready" : "p2_ready"] = newReady;

    // Check if both will be ready
    const p1Ready = isP1 ? newReady : room.p1_ready;
    const p2Ready = isP1 ? room.p2_ready : newReady;
    const p2Connected = isP1 ? room.p2_session !== null : true;

    if (p1Ready && p2Ready && p2Connected) {
      updates.status = "countdown";
    }

    await supabase.from("mp_rooms").update(updates).eq("code", room.code);
  }, [room, sessionId]);

  // Leave room
  const leaveRoom = useCallback(async () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (room) {
      await supabase.from("mp_rooms").delete().eq("code", room.code);
    }
    setRoom(null);
    setView("menu");
    setGameState(null);
    stateRef.current = null;
    setOpponent(null);
    setWinner(null);
  }, [room]);

  // Rematch
  const rematch = useCallback(async () => {
    if (!room) return;
    const newSeed = Math.floor(Math.random() * 1e9);

    // Tell opponent to go back to lobby
    channelRef.current?.send({
      type: "broadcast",
      event: "msg",
      payload: { type: "rematch" } as BroadcastMessage,
    });

    // Reset room to waiting with a new seed
    await supabase
      .from("mp_rooms")
      .update({ status: "waiting", p1_ready: false, p2_ready: false, winner: null, seed: newSeed, updated_at: new Date().toISOString() })
      .eq("code", room.code);

    setSeed(newSeed);
    setWinner(null);
    setGameState(null);
    stateRef.current = null;
    setOpponent(null);
    gameOverSentRef.current = false;
    pendingGarbageRef.current = 0;
    setView("lobby");
  }, [room]);

  const copyRoom = async () => {
    if (!roomCode) return;
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  // --- Render ---

  if (view === "menu") {
    return (
      <div className="screen landing-screen online-screen">
        <div className="online-panel">
          <Button variant="ghost" onClick={onExit}>{"\u2190"} BACK</Button>
          <h1 className="online-title">ONLINE BATTLE</h1>
          <p className="online-description">Create a room and invite a friend, or join with a code.</p>
          <div className={`connection-pill ${supabaseConfigured ? "connection-connected" : "connection-offline"}`}>
            <span className="status-icon">{supabaseConfigured ? "\u25CF" : "\u25CB"}</span>
            {supabaseConfigured ? "ONLINE" : "NOT CONFIGURED"}
          </div>
          {!supabaseConfigured && (
            <div className="server-warning">
              <p>Online multiplayer is not configured. Solo Play is available from the main menu.</p>
            </div>
          )}
          <div className="online-actions">
            <Button variant="primary" size="lg" disabled={!supabaseConfigured} onClick={createRoom}>CREATE ROOM</Button>
            <div className="join-row">
              <input
                className="room-input"
                value={roomInput}
                maxLength={6}
                onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                aria-label="Room code"
              />
              <Button variant="secondary" size="lg" disabled={!supabaseConfigured} onClick={joinRoom}>JOIN</Button>
            </div>
          </div>
          {errorMessage && <p className="error-message">{errorMessage}</p>}
        </div>
      </div>
    );
  }

  if (view === "lobby") {
    const isP1 = room?.p1_session === sessionId;
    const selfReady = isP1 ? room?.p1_ready : room?.p2_ready;
    const opponentConnected = isP1 ? room?.p2_session !== null && room?.p2_session !== undefined : true;
    const opponentReady = isP1 ? room?.p2_ready : room?.p1_ready;

    return (
      <div className="screen landing-screen online-screen">
        <div className="online-panel lobby-panel">
          <Button variant="ghost" onClick={leaveRoom}>{"\u2190"} EXIT</Button>
          <span className="eyebrow">WAITING LOBBY</span>
          <h1 className="online-title">ROOM READY</h1>
          <button className="room-code" onClick={copyRoom} aria-label="Copy room code">
            {roomCode}
            <span>{copied ? "COPIED" : "COPY CODE"}</span>
          </button>
          <div className="lobby-players">
            <LobbyPlayer label={`PLAYER ${isP1 ? 1 : 2}`} connected={true} ready={!!selfReady} />
            <span className="vs-label">VS</span>
            <LobbyPlayer label={`PLAYER ${isP1 ? 2 : 1}`} connected={opponentConnected} ready={!!opponentReady} />
          </div>
          <Button
            variant={selfReady ? "secondary" : "primary"}
            size="lg"
            disabled={!opponentConnected || room?.status === "countdown"}
            onClick={toggleReady}
          >
            {selfReady ? "CANCEL READY" : "READY"}
          </Button>
          {countdown !== null && <div className="lobby-countdown">MATCH STARTING {"\u00B7"} {countdown}</div>}
          <p className="lobby-help">Share this code with the other player. Both players must be ready.</p>
          {errorMessage && <p className="error-message">{errorMessage}</p>}
        </div>
      </div>
    );
  }

  // Game view
  if (!gameState) return null;

  const ghost = gameState.active ? getGhostPiece(gameState) : null;
  const renderBoard = getRenderBoard(gameState);
  const oppBoard = opponent ? toBoard(opponent.board) : null;
  const oppActive = opponent ? toActive(opponent.active) : null;

  return (
    <div className="screen game-screen online-game">
      <header className="game-header">
        <Button variant="ghost" onClick={leaveRoom}>{"\u2190"} LEAVE</Button>
        <div className="game-status-tag">ROOM {roomCode}</div>
        <div className="connection-pill connection-connected">{"\u25CF"} CONNECTED</div>
      </header>
      <div className="online-layout">
        <div className="online-main-board">
          <div className="online-player-label">YOU {"\u00B7"} PLAYER {playerId}</div>
          <GameBoard
            board={renderBoard}
            activePiece={gameState.active}
            ghostY={ghost?.y}
            cellSize={30}
            clearFlash={clearFlash}
          />
          {clearLabel && (
            <div className={`clear-label ${clearLabel === "TETRIS!" ? "clear-label-tetris" : ""}`}>{clearLabel}</div>
          )}
          <div className="online-stats">
            <strong>{gameState.score.toLocaleString()}</strong><span>SCORE</span>
            <strong>{gameState.lines}</strong><span>LINES</span>
            <strong>{gameState.level}</strong><span>LEVEL</span>
          </div>
        </div>
        <div className="online-opponent-column">
          <div className="online-player-label">OPPONENT {"\u00B7"} PLAYER {playerId === 1 ? 2 : 1}</div>
          {oppBoard && <GameBoard board={oppBoard} activePiece={oppActive} cellSize={16} />}
          {opponent && (
            <div className="online-opponent-stats">
              <span>{opponent.score.toLocaleString()} SCORE</span>
              <span>{opponent.lines} LINES</span>
            </div>
          )}
        </div>
        <aside className="online-side-panel">
          <HoldPanel hold={gameState.hold} />
          <NextQueue queue={gameState.queue} cellSize={12} />
        </aside>
      </div>
      <Modal open={winner !== null} dismissable={false}>
        <div className="result-modal">
          <h2 className="result-title">{winner === playerId ? "YOU WIN" : "YOU LOSE"}</h2>
          <p className="online-result-copy">Room {roomCode} has ended.</p>
          <div className="result-actions">
            <Button variant="primary" onClick={rematch}>REMATCH</Button>
            <Button variant="secondary" onClick={leaveRoom}>EXIT TO MENU</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function LobbyPlayer({ label, connected, ready }: { label: string; connected: boolean; ready: boolean }) {
  return (
    <div className="lobby-player">
      <strong>{label}</strong>
      <span className={connected ? "state-good" : "state-muted"}>
        {connected ? (ready ? "READY" : "CONNECTED") : "WAITING"}
      </span>
    </div>
  );
}

function toBoard(rows: string[][]): Board {
  return rows.map((row) =>
    row.map((cell): Cell => {
      if (cell === "G" || isPiece(cell)) return cell as Cell;
      return null;
    }),
  );
}

function toActive(active: OpponentSnapshot["active"]): ActivePiece | null {
  if (!active || !isPiece(active.type) || ![0, 1, 2, 3].includes(active.rotation)) return null;
  return { type: active.type, x: active.x, y: active.y, rotation: active.rotation as Rotation };
}

function isPiece(value: string | null | undefined): value is PieceType {
  return value === "I" || value === "O" || value === "T" || value === "S" || value === "Z" || value === "J" || value === "L";
}
