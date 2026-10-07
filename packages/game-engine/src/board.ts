import { BOARD_HEIGHT, BOARD_WIDTH, BUFFER_HEIGHT } from './constants.ts';
import { getCells } from './pieces.ts';
import type { ActivePiece, Board, Cell, Row } from './types.ts';

function emptyRow(): Row {
  return Array.from({ length: BOARD_WIDTH }, (): Cell => null);
}

export function createBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, emptyRow);
}

/** Absolute board coordinates [x, y] occupied by a piece. */
export function pieceCells(piece: ActivePiece): readonly (readonly [number, number])[] {
  return getCells(piece.type, piece.rotation).map(([dx, dy]) => [piece.x + dx, piece.y + dy]);
}

/** True if the piece overlaps a wall, the floor, the ceiling or a locked block. */
export function collides(board: Board, piece: ActivePiece): boolean {
  return pieceCells(piece).some(([x, y]) => {
    if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) return true;
    return (board[y] as Row)[x] !== null;
  });
}

export function lockPiece(board: Board, piece: ActivePiece): Board {
  const rows = board.map((row) => [...row]);
  for (const [x, y] of pieceCells(piece)) {
    (rows[y] as Cell[])[x] = piece.type;
  }
  return rows;
}

/** Number of rows the piece can fall before touching something. */
export function dropDistance(board: Board, piece: ActivePiece): number {
  let d = 0;
  while (!collides(board, { ...piece, y: piece.y + d + 1 })) d++;
  return d;
}

export function isGrounded(board: Board, piece: ActivePiece): boolean {
  return collides(board, { ...piece, y: piece.y + 1 });
}

/** True if every cell of the piece sits in the hidden buffer rows. */
export function isEntirelyInBuffer(piece: ActivePiece): boolean {
  return pieceCells(piece).every(([, y]) => y < BUFFER_HEIGHT);
}

export function clearFullRows(board: Board): { board: Board; cleared: number } {
  const kept = board.filter((row) => row.some((cell) => cell === null));
  const cleared = board.length - kept.length;
  if (cleared === 0) return { board, cleared: 0 };
  const padding = Array.from({ length: cleared }, emptyRow);
  return { board: [...padding, ...kept], cleared };
}

/**
 * Raise the stack by `lines` garbage rows that share one hole column.
 * `overflow` is true when existing blocks were pushed off the top of the board.
 */
export function insertGarbage(
  board: Board,
  lines: number,
  holeColumn: number,
): { board: Board; overflow: boolean } {
  const pushedOff = board.slice(0, lines);
  const overflow = pushedOff.some((row) => row.some((cell) => cell !== null));
  const garbageRow: Row = Array.from({ length: BOARD_WIDTH }, (_, x): Cell =>
    x === holeColumn ? null : 'G',
  );
  const garbage = Array.from({ length: lines }, () => garbageRow);
  return { board: [...board.slice(lines), ...garbage], overflow };
}
