import { BUFFER_HEIGHT, BOARD_WIDTH, type Board } from "@tetris/game-engine";
import { cellColor, highlightColor, shadowColor } from "./colors";

export interface RenderOptions {
  cellSize: number;
  showGhost?: boolean;
  ghostY?: number;
  activePiece?: {
    type: string;
    y: number;
    cells: readonly (readonly [number, number])[];
  } | null;
  paused?: boolean;
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  size: number,
): void {
  const px = x * size;
  const py = y * size;
  ctx.save();
  ctx.shadowColor = shadowColor(color);
  ctx.shadowBlur = Math.max(1, size * 0.1);
  ctx.shadowOffsetY = Math.max(1, size * 0.06);
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);
  ctx.restore();
  ctx.fillStyle = highlightColor(color);
  ctx.fillRect(px, py, size, Math.max(1, size * 0.12));
  ctx.fillStyle = shadowColor(color);
  ctx.fillRect(px, py + size - Math.max(1, size * 0.12), size, Math.max(1, size * 0.12));
  ctx.strokeStyle = "rgba(2, 6, 23, 0.28)";
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.strokeRect(px + ctx.lineWidth / 2, py + ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
}

export function renderBoard(
  canvas: HTMLCanvasElement,
  board: Board,
  opts: RenderOptions,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { cellSize: s, showGhost, ghostY, activePiece, paused } = opts;
  const visibleRows = board.length - BUFFER_HEIGHT;

  canvas.width = BOARD_WIDTH * s;
  canvas.height = visibleRows * s;

  // Background
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = 1; x < BOARD_WIDTH; x++) {
    ctx.beginPath();
    ctx.moveTo(x * s, 0);
    ctx.lineTo(x * s, canvas.height);
    ctx.stroke();
  }
  for (let y = 1; y < visibleRows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * s);
    ctx.lineTo(canvas.width, y * s);
    ctx.stroke();
  }

  // Locked blocks (only visible portion)
  for (let row = BUFFER_HEIGHT; row < board.length; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const cell = board[row]![col];
      const color = cellColor(cell);
      if (color) drawCell(ctx, col, row - BUFFER_HEIGHT, color, s);
    }
  }

  // Ghost piece — outlined transparent style so players see the landing spot clearly
  if (showGhost && activePiece && ghostY !== undefined) {
    const ghostColor = getColorForType(activePiece.type);
    for (const [dx, dy] of activePiece.cells) {
      const x = dx;
      const y = ghostY + (dy - activePiece.y) - BUFFER_HEIGHT;
      if (y >= 0 && y < visibleRows) {
        const px = x * s;
        const py = y * s;
        ctx.fillStyle = ghostColor + "1a";
        ctx.fillRect(px, py, s, s);
        ctx.strokeStyle = ghostColor + "99";
        ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.strokeRect(px + ctx.lineWidth / 2, py + ctx.lineWidth / 2, s - ctx.lineWidth, s - ctx.lineWidth);
      }
    }
  }

  // Active piece
  if (activePiece && !paused) {
    const color = activePiece.type ? getColorForType(activePiece.type) : "#ffffff";
    for (const [dx, dy] of activePiece.cells) {
      const y = dy - BUFFER_HEIGHT;
      if (y >= 0 && y < visibleRows) {
        drawCell(ctx, dx, y, color, s);
      }
    }
  }

  if (paused) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `bold ${s * 1.5}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
  }
}

function getColorForType(type: string): string {
  const colors: Record<string, string> = {
    I: "#22d3ee",
    O: "#fbbf24",
    T: "#a855f7",
    S: "#22c55e",
    Z: "#ef4444",
    J: "#3b82f6",
    L: "#f97316",
  };
  return colors[type] ?? "#ffffff";
}

export function renderMiniPiece(
  canvas: HTMLCanvasElement,
  cells: readonly (readonly [number, number])[],
  type: string,
  cellSize: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of cells) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const w = (maxX - minX + 1) * cellSize;
  const h = (maxY - minY + 1) * cellSize;
  canvas.width = w;
  canvas.height = h;

  ctx.clearRect(0, 0, w, h);

  const color = getColorForType(type);
  for (const [x, y] of cells) {
    drawCell(ctx, x - minX, y - minY, color, cellSize);
  }
}
