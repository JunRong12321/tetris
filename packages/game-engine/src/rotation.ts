import { collides } from './board.ts';
import { getKicks } from './pieces.ts';
import type { ActivePiece, Board, Rotation } from './types.ts';

/** Rotate with SRS wall kicks. Returns the new piece, or null if every kick is blocked. */
export function tryRotate(
  board: Board,
  piece: ActivePiece,
  direction: 1 | -1,
): ActivePiece | null {
  const to = ((piece.rotation + direction + 4) % 4) as Rotation;
  for (const [dx, dy] of getKicks(piece.type, piece.rotation, to)) {
    const candidate: ActivePiece = {
      ...piece,
      rotation: to,
      x: piece.x + dx,
      y: piece.y + dy,
    };
    if (!collides(board, candidate)) return candidate;
  }
  return null;
}
