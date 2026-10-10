import { collides, type ActivePiece, type Board } from "@tetris/game-engine";

/**
 * Row where the active piece would land if hard-dropped.
 *
 * The online client only receives the opponent-visible piece position from the
 * server, so the landing preview is derived locally from the same collision
 * rule the server uses (the shared engine). It is cosmetic: the server alone
 * decides where a piece actually locks.
 */
export function ghostY(board: Board, active: ActivePiece): number {
  if (collides(board, active)) return active.y;
  let y = active.y;
  while (!collides(board, { ...active, y: y + 1 })) y += 1;
  return y;
}
