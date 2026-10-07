import { BOARD_HEIGHT, BOARD_WIDTH, createGame } from '../src/index.ts';
import type { Board, Cell, GameState } from '../src/index.ts';

/**
 * Build a board from a spec of `row -> EMPTY columns`. Listed rows are filled with garbage
 * blocks except in the listed columns; unlisted rows are empty.
 */
export function makeBoard(spec: Record<number, readonly number[]>): Board {
  return Array.from({ length: BOARD_HEIGHT }, (_, y) => {
    const empty = spec[y];
    return Array.from({ length: BOARD_WIDTH }, (_, x): Cell => (empty && !empty.includes(x) ? 'G' : null));
  });
}

export function stateWith(overrides: Partial<GameState>, seed = 1): GameState {
  return { ...createGame(seed), ...overrides };
}
