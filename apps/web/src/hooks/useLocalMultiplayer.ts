import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyAction,
  createGame,
  getGhostPiece,
  getRenderBoard,
  pieceCells,
  receiveGarbage,
  tick,
  type GameEvent,
  type GameState,
  type PlayerAction,
} from "@tetris/game-engine";

export interface PlayerSnapshot {
  state: GameState;
  activeCells: readonly (readonly [number, number])[];
  ghostY: number;
}

export interface MultiplayerState {
  player1: GameState | null;
  player2: GameState | null;
  winner: 1 | 2 | null;
  gameOver: boolean;
}

function processEvents(
  events: readonly GameEvent[],
  isPlayer1: boolean,
  opponentState: GameState,
): { garbageSent: number; gameOver: boolean } {
  let garbageSent = 0;
  let gameOver = false;
  for (const e of events) {
    if (e.type === "ATTACK") garbageSent += e.lines;
    if (e.type === "GAME_OVER") gameOver = true;
  }
  return { garbageSent, gameOver };
}

export function useLocalMultiplayer() {
  const [state, setState] = useState<MultiplayerState>({
    player1: null,
    player2: null,
    winner: null,
    gameOver: false,
  });
  const p1Ref = useRef<GameState | null>(null);
  const p2Ref = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const pausedRef = useRef<boolean>(false);
  const winnerRef = useRef<1 | 2 | null>(null);

  const syncState = useCallback(() => {
    setState({
      player1: p1Ref.current,
      player2: p2Ref.current,
      winner: winnerRef.current,
      gameOver: winnerRef.current !== null,
    });
  }, []);

  const applyPlayerAction = useCallback(
    (player: 1 | 2, action: PlayerAction) => {
      if (pausedRef.current || winnerRef.current !== null) return;
      const ref = player === 1 ? p1Ref : p2Ref;
      const otherRef = player === 1 ? p2Ref : p1Ref;
      const current = ref.current;
      if (!current || current.status !== "playing") return;

      const { state: next, events } = applyAction(current, action);
      ref.current = next;

      const { garbageSent, gameOver } = processEvents(events, player === 1, otherRef.current!);
      if (garbageSent > 0 && otherRef.current && otherRef.current.status === "playing") {
        otherRef.current = receiveGarbage(otherRef.current, garbageSent);
      }
      if (gameOver && winnerRef.current === null) {
        winnerRef.current = player === 1 ? 2 : 1;
      }
      syncState();
    },
    [syncState],
  );

  const startMatch = useCallback(
    (seed: number, startLevel: number = 1) => {
      p1Ref.current = createGame(seed, { startLevel });
      p2Ref.current = createGame(seed, { startLevel });
      winnerRef.current = null;
      pausedRef.current = false;
      lastTimeRef.current = performance.now();
      syncState();
    },
    [syncState],
  );

  const stopMatch = useCallback(() => {
    p1Ref.current = null;
    p2Ref.current = null;
    winnerRef.current = null;
    pausedRef.current = false;
    syncState();
  }, [syncState]);

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    syncState();
  }, [syncState]);

  // Gravity loop
  useEffect(() => {
    const loop = (now: number) => {
      if (!pausedRef.current && winnerRef.current === null) {
        const dt = now - lastTimeRef.current;
        lastTimeRef.current = now;
        if (dt > 0 && dt < 1000) {
          let changed = false;

          if (p1Ref.current && p1Ref.current.status === "playing") {
            const { state: next, events } = tick(p1Ref.current, dt);
            if (next !== p1Ref.current) {
              const { garbageSent, gameOver } = processEvents(events, true, p2Ref.current!);
              p1Ref.current = next;
              if (garbageSent > 0 && p2Ref.current && p2Ref.current.status === "playing") {
                p2Ref.current = receiveGarbage(p2Ref.current, garbageSent);
              }
              if (gameOver && winnerRef.current === null) {
                winnerRef.current = 2;
              }
              changed = true;
            }
          }

          if (p2Ref.current && p2Ref.current.status === "playing") {
            const { state: next, events } = tick(p2Ref.current, dt);
            if (next !== p2Ref.current) {
              const { garbageSent, gameOver } = processEvents(events, false, p1Ref.current!);
              p2Ref.current = next;
              if (garbageSent > 0 && p1Ref.current && p1Ref.current.status === "playing") {
                p1Ref.current = receiveGarbage(p1Ref.current, garbageSent);
              }
              if (gameOver && winnerRef.current === null) {
                winnerRef.current = 1;
              }
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
  }, [syncState]);

  const getSnapshot = useCallback(
    (player: 1 | 2): PlayerSnapshot | null => {
      const s = player === 1 ? p1Ref.current : p2Ref.current;
      if (!s || !s.active) return null;
      const ghost = getGhostPiece(s);
      return {
        state: s,
        activeCells: pieceCells(s.active),
        ghostY: ghost ? ghost.y : s.active.y,
      };
    },
    [],
  );

  const isPaused = useCallback(() => pausedRef.current, []);

  return {
    state,
    applyPlayerAction,
    startMatch,
    stopMatch,
    togglePause,
    getSnapshot,
    isPaused,
  };
}
