import { describe, expect, it } from 'vitest';
import { BOARD_HEIGHT, collides, createBoard } from '../src/index.ts';
import { clearFullRows, insertGarbage, lockPiece } from '../src/board.ts';
import { makeBoard } from './helpers.ts';

describe('collision', () => {
  it('detects the left and right walls', () => {
    expect(collides(createBoard(), { type: 'T', x: -1, y: 30, rotation: 0 })).toBe(true);
    expect(collides(createBoard(), { type: 'T', x: 8, y: 30, rotation: 0 })).toBe(true);
    expect(collides(createBoard(), { type: 'T', x: 0, y: 30, rotation: 0 })).toBe(false);
  });

  it('detects the floor', () => {
    expect(collides(createBoard(), { type: 'O', x: 4, y: BOARD_HEIGHT - 1, rotation: 0 })).toBe(true);
    expect(collides(createBoard(), { type: 'O', x: 4, y: BOARD_HEIGHT - 2, rotation: 0 })).toBe(false);
  });

  it('detects locked blocks', () => {
    const board = makeBoard({ [BOARD_HEIGHT - 1]: [] });
    expect(collides(board, { type: 'O', x: 4, y: BOARD_HEIGHT - 2, rotation: 0 })).toBe(true);
  });
});

describe('locking', () => {
  it('writes the piece colour into the board without mutating the old board', () => {
    const board = createBoard();
    const locked = lockPiece(board, { type: 'O', x: 4, y: 38, rotation: 0 });
    expect(locked[38]?.[4]).toBe('O');
    expect(locked[39]?.[5]).toBe('O');
    expect(board[38]?.[4]).toBeNull();
  });
});

describe('line clearing', () => {
  it('removes full rows and drops the rows above them', () => {
    const board = makeBoard({ 37: [1, 2, 3, 4, 5, 6, 7, 8, 9], 38: [], 39: [] });
    const { board: after, cleared } = clearFullRows(board);
    expect(cleared).toBe(2);
    expect(after).toHaveLength(BOARD_HEIGHT);
    expect(after[39]).toEqual(board[37]);
    expect(after[38]?.every((c) => c === null)).toBe(true);
  });

  it('leaves the board alone when nothing is full', () => {
    const board = makeBoard({ 39: [3] });
    expect(clearFullRows(board).cleared).toBe(0);
  });
});

describe('garbage insertion', () => {
  it('raises the stack and leaves one shared hole column', () => {
    const board = makeBoard({ 39: [0] });
    const { board: after, overflow } = insertGarbage(board, 2, 6);
    expect(overflow).toBe(false);
    expect(after[39]?.filter((c) => c === null)).toHaveLength(1);
    expect(after[39]?.[6]).toBeNull();
    expect(after[38]?.[6]).toBeNull();
    // The old bottom row (empty only in column 0) has risen two rows, intact.
    expect(after[37]).toEqual(board[39]);
  });

  it('reports overflow when blocks are pushed off the top', () => {
    const board = makeBoard({ 0: [] });
    expect(insertGarbage(board, 1, 0).overflow).toBe(true);
  });
});
