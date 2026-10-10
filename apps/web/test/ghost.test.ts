import { describe, expect, it } from "vitest";
import { BOARD_HEIGHT, collides, createBoard, type ActivePiece, type Board, type Cell } from "@tetris/game-engine";
import { ghostY } from "../src/game/ghost";

const piece = (overrides: Partial<ActivePiece> = {}): ActivePiece => ({ type: "T", x: 3, y: 0, rotation: 0, ...overrides });

function withFilledRows(rows: number[]): Board {
  const board = createBoard().map((row) => [...row]) as Cell[][];
  for (const y of rows) board[y] = board[y]!.map((): Cell => "G");
  return board as Board;
}

describe("ghostY", () => {
  it("rests the piece on the floor of an empty board", () => {
    const board = createBoard();
    const landing = ghostY(board, piece());
    expect(collides(board, piece({ y: landing }))).toBe(false);
    expect(collides(board, piece({ y: landing + 1 }))).toBe(true);
    expect(landing).toBeGreaterThan(0);
    expect(landing).toBeLessThan(BOARD_HEIGHT);
  });

  it("stops above a stack instead of passing through it", () => {
    const board = withFilledRows([BOARD_HEIGHT - 1, BOARD_HEIGHT - 2]);
    const floor = ghostY(createBoard(), piece());
    const landing = ghostY(board, piece());
    expect(landing).toBe(floor - 2);
    expect(collides(board, piece({ y: landing }))).toBe(false);
  });

  it("never reports a row above the piece's current position", () => {
    const board = createBoard();
    const low = piece({ y: 10 });
    expect(ghostY(board, low)).toBeGreaterThanOrEqual(10);
  });

  it("returns the current row when the piece already overlaps something", () => {
    const board = withFilledRows([0, 1, 2]);
    expect(ghostY(board, piece({ y: 0 }))).toBe(0);
  });
});
