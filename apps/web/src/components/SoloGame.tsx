import { useEffect, useRef, useState } from "react";
import {
  applyAction,
  createGame,
  getGhostPiece,
  getRenderBoard,
  tick,
  type GameState,
  type PlayerAction,
} from "@tetris/game-engine";
import { InputHandler } from "../game/input";
import { GameBoard } from "./GameBoard";
import { HoldPanel } from "./HoldPanel";
import { NextQueue } from "./NextQueue";
import { ScorePanel } from "./ScorePanel";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface SoloGameProps {
  onExit: () => void;
  seed: number;
  startLevel: number;
}

export function SoloGame({ onExit, seed, startLevel }: SoloGameProps) {
  const [gameState, setGameState] = useState<GameState>(() => createGame(seed, { startLevel }));
  const stateRef = useRef(gameState);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const pausedRef = useRef<boolean>(false);
  const [paused, setPaused] = useState(false);
  const [clearFlash, setClearFlash] = useState(false);
  const [clearLabel, setClearLabel] = useState<string | null>(null);
  const clearFlashTimerRef = useRef<number | null>(null);
  const clearLabelTimerRef = useRef<number | null>(null);
  const inputRef = useRef<InputHandler>(new InputHandler());
  const [, forceRender] = useState(0);

  const updateState = (next: GameState) => {
    const previous = stateRef.current;
    if (next.lines > previous.lines) {
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
  };

  useEffect(() => {
    const loop = (now: number) => {
      const current = stateRef.current;
      if (current.status === "playing" && !pausedRef.current) {
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
  }, []);

  useEffect(() => {
    const handler = inputRef.current;
    handler.attach(
      (action: PlayerAction) => {
        const current = stateRef.current;
        if (!current || current.status !== "playing" || pausedRef.current) return;
        const { state: next } = applyAction(current, action);
        updateState(next);
      },
      () => {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
        forceRender((n) => n + 1);
      },
    );
    return () => handler.detach();
  }, []);

  const ghost = gameState.active ? getGhostPiece(gameState) : null;
  const renderBoard = getRenderBoard(gameState);

  return (
    <div className="screen game-screen solo-game">
      <header className="game-header">
        <Button variant="ghost" size="md" onClick={onExit}>
          {"\u2190"} EXIT
        </Button>
        <div className="game-status-tag">SOLO PLAY</div>
        <Button variant="ghost" size="md" onClick={() => {
          pausedRef.current = !pausedRef.current;
          setPaused(pausedRef.current);
        }}>
          {paused ? "RESUME" : "PAUSE"}
        </Button>
      </header>

      <div className="game-layout solo-layout">
        <aside className="game-side-left">
          <HoldPanel hold={gameState.hold} />
          <ScorePanel state={gameState} label="STATS" />
        </aside>

        <div className="game-board-center">
          <GameBoard
            board={renderBoard}
            activePiece={gameState.active}
            ghostY={ghost?.y}
            cellSize={30}
            paused={paused}
            clearFlash={clearFlash}
          />
          {clearLabel && <div className={`clear-label ${clearLabel === "TETRIS!" ? "clear-label-tetris" : ""}`}>{clearLabel}</div>}
        </div>

        <aside className="game-side-right">
          <NextQueue queue={gameState.queue} cellSize={14} />
        </aside>
      </div>

      <Modal open={gameState.status === "gameover"} dismissable={false}>
        <div className="result-modal">
          <h2 className="result-title">GAME OVER</h2>
          <dl className="result-stats">
            <div><dt>SCORE</dt><dd>{gameState.score.toLocaleString()}</dd></div>
            <div><dt>LINES</dt><dd>{gameState.lines}</dd></div>
            <div><dt>LEVEL</dt><dd>{gameState.level}</dd></div>
            <div><dt>PIECES</dt><dd>{gameState.piecesPlaced}</dd></div>
          </dl>
          <div className="result-actions">
            <Button variant="primary" onClick={() => updateState(createGame(Math.floor(Math.random() * 1e9), { startLevel }))}>
              PLAY AGAIN
            </Button>
            <Button variant="secondary" onClick={onExit}>
              EXIT TO MENU
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
