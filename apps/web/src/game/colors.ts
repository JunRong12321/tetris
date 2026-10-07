import type { Cell, PieceType } from "@tetris/game-engine";

export const PIECE_COLORS: Record<PieceType, string> = {
  I: "#22d3ee",
  O: "#fbbf24",
  T: "#a855f7",
  S: "#22c55e",
  Z: "#ef4444",
  J: "#3b82f6",
  L: "#f97316",
};

export const GARBAGE_COLOR = "#64748b";

/** Lighter fill used for the top edge of a block, giving a subtle 3D effect. */
export function highlightColor(hex: string): string {
  return shade(hex, 0.25);
}

/** Darker shade used for the bottom edge / border. */
export function shadowColor(hex: string): string {
  return shade(hex, -0.2);
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 0xff) + 255 * factor);
  const g = clamp(((n >> 8) & 0xff) + 255 * factor);
  const b = clamp((n & 0xff) + 255 * factor);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

export function cellColor(cell: Cell): string | null {
  if (cell === null) return null;
  if (cell === "G") return GARBAGE_COLOR;
  return PIECE_COLORS[cell];
}
