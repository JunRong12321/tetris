import { useEffect, useRef } from "react";
import type { PieceType } from "@tetris/game-engine";
import { getCells } from "@tetris/game-engine";
import { renderMiniPiece } from "../game/render";

interface PiecePreviewProps {
  type: PieceType | null;
  cellSize?: number;
}

export function PiecePreview({ type, cellSize = 16 }: PiecePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!type) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = cellSize * 4;
        canvas.height = cellSize * 2;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    const cells = getCells(type, 0);
    renderMiniPiece(canvas, cells, type, cellSize);
  }, [type, cellSize]);

  return <canvas ref={canvasRef} className="piece-preview-canvas" />;
}
