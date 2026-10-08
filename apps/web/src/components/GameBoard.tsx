import { useEffect, useRef } from "react";
import { type Board, type ActivePiece, pieceCells } from "@tetris/game-engine";
import { renderBoard } from "../game/render";

interface GameBoardProps {
  board: Board;
  activePiece: ActivePiece | null;
  ghostY?: number;
  cellSize?: number;
  paused?: boolean;
  clearFlash?: boolean;
}

export function GameBoard({
  board,
  activePiece,
  ghostY,
  cellSize = 28,
  paused = false,
  clearFlash = false,
}: GameBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const activeData = activePiece
      ? { type: activePiece.type, y: activePiece.y, cells: pieceCells(activePiece) }
      : null;

    renderBoard(canvas, board, {
      cellSize,
      showGhost: activePiece !== null,
      ghostY,
      activePiece: activeData,
      paused,
    });
  }, [board, activePiece, ghostY, cellSize, paused]);

  return (
    <div className={`board-wrapper${clearFlash ? " clear-flash" : ""}`} style={{ "--cell-size": `${cellSize}px` } as React.CSSProperties}>
      <canvas ref={canvasRef} className="game-board-canvas" />
    </div>
  );
}
