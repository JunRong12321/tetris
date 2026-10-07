import { useEffect, useRef } from "react";
import {
  BUFFER_HEIGHT,
  BOARD_WIDTH,
  type Board,
  type ActivePiece,
} from "@tetris/game-engine";
import { renderBoard } from "../game/render";
import { pieceCells } from "@tetris/game-engine";

interface GameBoardProps {
  board: Board;
  activePiece: ActivePiece | null;
  ghostY?: number;
  cellSize?: number;
  paused?: boolean;
}

export function GameBoard({
  board,
  activePiece,
  ghostY,
  cellSize = 28,
  paused = false,
}: GameBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const activeData = activePiece
      ? { type: activePiece.type, cells: pieceCells(activePiece) }
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
    <div className="board-wrapper" style={{ "--cell-size": `${cellSize}px` } as React.CSSProperties}>
      <canvas ref={canvasRef} className="game-board-canvas" />
    </div>
  );
}
