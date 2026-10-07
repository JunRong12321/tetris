import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyAction,
  createGame,
  getGhostPiece,
  getRenderBoard,
  getVisibleBoard,
  pieceCells,
  tick,
  type GameState,
  type PlayerAction,
} from "@tetris/game-engine";
import { InputHandler } from "../game/input";

export interface GameSnapshot {
  state: GameState;
  activeCells: readonly (readonly [number, number])[];
  ghostY: number;
}

export function useGameLoop() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const pausedRef = useRef<boolean>(false);
  const inputRef = useRef<InputHandler>(new InputHandler());

  const updateState = useCallback((next: GameState) => {
    stateRef.current = next;
    setGameState(next);
  }, []);

  const handleAction = useCallback(
    (action: PlayerAction) => {
      const current = stateRef.current;
      if (!current || current.status !== "playing" || pausedRef.current) return;
      const { state: next } = applyAction(current, action);
      updateState(next);
    },
    [updateState],
  );

  const handlePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setGameState((s) => (s ? { ...s } : s));
  }, []);

  const startGame = useCallback(
    (seed: number, startLevel: number = 1) => {
      const game = createGame(seed, { startLevel });
      pausedRef.current = false;
      updateState(game);
      lastTimeRef.current = performance.now();
    },
    [updateState],
  );

  const stopGame = useCallback(() => {
    stateRef.current = null;
    setGameState(null);
  }, []);

  // Game loop using requestAnimationFrame
  useEffect(() => {
    const loop = (now: number) => {
      const current = stateRef.current;
      if (current && current.status === "playing" && !pausedRef.current) {
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
    return () => cancelAnimationFrame(rafRef.current);
  }, [updateState]);

  // Input handling
  useEffect(() => {
    const handler = inputRef.current;
    handler.attach(handleAction, handlePause);
    return () => handler.detach();
  }, [handleAction, handlePause]);

  const getSnapshot = useCallback((): GameSnapshot | null => {
    const s = stateRef.current;
    if (!s || !s.active) return null;
    const ghost = getGhostPiece(s);
    return {
      state: s,
      activeCells: pieceCells(s.active),
      ghostY: ghost ? ghost.y : s.active.y,
    };
  }, []);

  const isPaused = useCallback(() => pausedRef.current, []);

  return {
    gameState,
    startGame,
    stopGame,
    getSnapshot,
    isPaused,
  };
}
