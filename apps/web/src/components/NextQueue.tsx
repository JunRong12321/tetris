import { useEffect, useRef } from "react";
import { getCells, type PieceType } from "@tetris/game-engine";
import { renderMiniPiece } from "../game/render";
import { PIECE_COLORS } from "../game/colors";

interface NextQueueProps {
  queue: readonly PieceType[];
  cellSize?: number;
}

export function NextQueue({ queue, cellSize = 14 }: NextQueueProps) {
  return (
    <div className="panel next-queue">
      <h3 className="panel-title">NEXT</h3>
      <div className="next-queue-list">
        {queue.map((piece, i) => (
          <PiecePreviewItem key={i} piece={piece} cellSize={cellSize} />
        ))}
      </div>
    </div>
  );
}

function PiecePreviewItem({ piece, cellSize }: { piece: PieceType; cellSize: number }) {
  return (
    <div className="next-piece-item" style={{ borderColor: `${PIECE_COLORS[piece]}33` }}>
      <MiniPiece type={piece} cellSize={cellSize} />
    </div>
  );
}

function MiniPiece({ type, cellSize }: { type: PieceType; cellSize: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderMiniPiece(canvas, getCells(type, 0), type, cellSize);
  }, [type, cellSize]);
  return <canvas ref={canvasRef} />;
}
