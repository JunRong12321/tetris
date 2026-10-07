import type { PieceType } from "@tetris/game-engine";
import { PiecePreview } from "./PiecePreview";

interface HoldPanelProps {
  hold: PieceType | null;
}

export function HoldPanel({ hold }: HoldPanelProps) {
  return (
    <div className="panel hold-panel">
      <h3 className="panel-title">HOLD</h3>
      <div className="hold-slot">
        <PiecePreview type={hold} cellSize={16} />
      </div>
    </div>
  );
}
