import { useEffect, useRef, useState, useCallback } from "react";
import {
  applyAction,
  createGame,
  getGhostPiece,
  getRenderBoard,
  receiveGarbage,
  tick,
  type GameEvent,
  type GameState,
  type PlayerAction,
} from "@tetris/game-engine";
import { GameBoard } from "./GameBoard";
import { HoldPanel } from "./HoldPanel";
import { NextQueue } from "./NextQueue";
import { ScorePanel } from "./ScorePanel";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface LocalMultiplayerProps {
  onExit: () => void;
  seed: number;
  startLevel: number;
}

const P2_KEYS: Record<string, PlayerAction> = {
  KeyJ: "MOVE_LEFT",
  KeyL: "MOVE_RIGHT",
  KeyK: "SOFT_DROP",
  Space: "HARD_DROP",
  KeyI: "ROTATE_CW",
  KeyU: "ROTATE_CCW",
  KeyO: "HOLD",
};

const P1_KEYS: Record<string, PlayerAction> = {
  ArrowLeft: "MOVE_LEFT",
  KeyA: "MOVE_LEFT",
  ArrowRight: "MOVE_RIGHT",
  KeyD: "MOVE_RIGHT",
  ArrowDown: "SOFT_DROP",
  KeyS: "SOFT_DROP",
  ArrowUp: "ROTATE_CW",
  KeyX: "ROTATE_CW",
  KeyZ: "ROTATE_CCW",
  KeyC: "HOLD",
};

export function LocalMultiplayer({ onExit, seed, startLevel }: LocalMultiplayerProps) {
  const [p1, setP1] = useState<GameState>(() => createGame(seed, { startLevel }));
  const [p2, setP2] = useState<GameState>(() => createGame(seed, { startLevel }));
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(3);

  const p1Ref = useRef(p1);
  const p2Ref = useRef(p2);
  const pausedRef = useRef(false);
  const winnerRef = useRef<1 | 2 | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const heldKeys = useRef<Set<string>>(new Set());

  p1Ref.current = p1;
  p2Ref.current = p2;

  const syncState = useCallback(() => {
    setP1(p1Ref.current);
    setP2(p2Ref.current);
    setWinner(winnerRef.current);
  }, []);

  const sendGarbage = (
    from: 1 | 2,
    events: readonly GameEvent[],
  ) => {
    let garbage = 0;
    let gameOver = false;
    for (const e of events) {
      if (e.type === "ATTACK") garbage += e.lines;
      if (e.type === "GAME_OVER") gameOver = true;
    }
    if (garbage > 0) {
      const target = from === 1 ? p2Ref : p1Ref;
      if (target.current && target.current.status === "playing") {
        target.current = receiveGarbage(target.current, garbage);
      }
    }
    if (gameOver && winnerRef.current === null) {
      winnerRef.current = from === 1 ? 2 : 1;
    }
  };

  const doAction = (player: 1 | 2, action: PlayerAction) => {
    if (pausedRef.current || winnerRef.current !== null) return;
    const ref = player === 1 ? p1Ref : p2Ref;
    if (!ref.current || ref.current.status !== "playing") return;
    const { state: next, events } = applyAction(ref.current, action);
    ref.current = next;
    sendGarbage(player, events);
    syncState();
  };

  // Countdown
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      lastTimeRef.current = performance.now();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 800);
    return () => clearTimeout(t);
  }, [countdown]);

  // Keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyP") {
        if (!e.repeat) {
          pausedRef.current = !pausedRef.current;
          setPaused(pausedRef.current);
        }
        e.preventDefault();
        return;
      }
      if (countdown !== null || pausedRef.current || winnerRef.current !== null) return;
      if (heldKeys.current.has(e.code)) return;

      const p1Action = P1_KEYS[e.code];
      const p2Action = P2_KEYS[e.code];
      if (!p1Action && !p2Action) return;
      e.preventDefault();
      heldKeys.current.add(e.code);
      if (p1Action) doAction(1, p1Action);
      if (p2Action) doAction(2, p2Action);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.current.delete(e.code);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [countdown, syncState]);

  // Gravity loop
  useEffect(() => {
    const loop = (now: number) => {
      if (!pausedRef.current && winnerRef.current === null && countdown === null) {
        const dt = now - lastTimeRef.current;
        lastTimeRef.current = now;
        if (dt > 0 && dt < 1000) {
          let changed = false;
          if (p1Ref.current.status === "playing") {
            const { state: next, events } = tick(p1Ref.current, dt);
            if (next !== p1Ref.current) {
              p1Ref.current = next;
              sendGarbage(1, events);
              changed = true;
            }
          }
          if (p2Ref.current.status === "playing") {
            const { state: next, events } = tick(p2Ref.current, dt);
            if (next !== p2Ref.current) {
              p2Ref.current = next;
              sendGarbage(2, events);
              changed = true;
            }
          }
          if (changed) syncState();
        }
      } else {
        lastTimeRef.current = now;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [countdown, syncState]);

  const rematch = () => {
    const newSeed = Math.floor(Math.random() * 1e9);
    p1Ref.current = createGame(newSeed, { startLevel });
    p2Ref.current = createGame(newSeed, { startLevel });
    winnerRef.current = null;
    pausedRef.current = false;
    setPaused(false);
    setCountdown(3);
    syncState();
  };

  const p1Ghost = p1.active ? getGhostPiece(p1) : null;
  const p2Ghost = p2.active ? getGhostPiece(p2) : null;
  const p1Board = getRenderBoard(p1);
  const p2Board = getRenderBoard(p2);

  return (
    <div className="screen game-screen versus-game">
      <header className="game-header">
        <Button variant="ghost" size="md" onClick={onExit}>
          EXIT
        </Button>
        <div className="game-status-tag">LOCAL VERSUS</div>
        <Button variant="ghost" size="md" onClick={() => {
          pausedRef.current = !pausedRef.current;
          setPaused(pausedRef.current);
        }}>
          {paused ? "RESUME" : "PAUSE"}
        </Button>
      </header>

      <div className="versus-layout">
        <div className="versus-player versus-player-1">
          <div className="versus-player-header">
            <span className="versus-player-name">PLAYER 1</span>
          </div>
          <div className="versus-board-area">
            <aside className="game-side-left">
              <HoldPanel hold={p1.hold} />
            </aside>
            <GameBoard
              board={p1Board}
              activePiece={p1.active}
              ghostY={p1Ghost?.y}
              cellSize={24}
              paused={paused}
            />
            <aside className="game-side-right">
              <NextQueue queue={p1.queue} cellSize={11} />
            </aside>
          </div>
          <ScorePanel state={p1} label="P1 STATS" />
        </div>

        <div className="versus-divider">
          <span className="vs-label">VS</span>
        </div>

        <div className="versus-player versus-player-2">
          <div className="versus-player-header">
            <span className="versus-player-name">PLAYER 2</span>
          </div>
          <div className="versus-board-area">
            <aside className="game-side-left">
              <HoldPanel hold={p2.hold} />
            </aside>
            <GameBoard
              board={p2Board}
              activePiece={p2.active}
              ghostY={p2Ghost?.y}
              cellSize={24}
              paused={paused}
            />
            <aside className="game-side-right">
              <NextQueue queue={p2.queue} cellSize={11} />
            </aside>
          </div>
          <ScorePanel state={p2} label="P2 STATS" />
        </div>
      </div>

      {countdown !== null && (
        <div className="countdown-overlay">
          <div className="countdown-number" key={countdown}>
            {countdown === 0 ? "GO!" : countdown}
          </div>
        </div>
      )}

      <Modal open={winner !== null} dismissable={false}>
        <div className="result-modal">
          <h2 className={`result-title ${winner === 1 ? "win-p1" : "win-p2"}`}>
            PLAYER {winner} WINS!
          </h2>
          <div className="result-sides">
            <div className="result-side">
              <h3>PLAYER 1</h3>
              <dl className="result-stats">
                <div><dt>SCORE</dt><dd>{p1.score.toLocaleString()}</dd></div>
                <div><dt>LINES</dt><dd>{p1.lines}</dd></div>
                <div><dt>LEVEL</dt><dd>{p1.level}</dd></div>
              </dl>
            </div>
            <div className="result-side">
              <h3>PLAYER 2</h3>
              <dl className="result-stats">
                <div><dt>SCORE</dt><dd>{p2.score.toLocaleString()}</dd></div>
                <div><dt>LINES</dt><dd>{p2.lines}</dd></div>
                <div><dt>LEVEL</dt><dd>{p2.level}</dd></div>
              </dl>
            </div>
          </div>
          <div className="result-actions">
            <Button variant="primary" onClick={rematch}>REMATCH</Button>
            <Button variant="secondary" onClick={onExit}>EXIT TO MENU</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
