import { BOARD_WIDTH } from './constants.ts';
import type { PieceType, Rotation } from './types.ts';

type Matrix = readonly (readonly number[])[];
export type Cell2D = readonly [x: number, y: number];

/** SRS spawn matrices. I uses a 4x4 box, O a 2x2 box, the rest 3x3. */
const BASE: Record<PieceType, Matrix> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

function rotateMatrixCW(m: Matrix): Matrix {
  const n = m.length;
  return m.map((_, r) => m.map((_, c) => (m[n - 1 - c] as readonly number[])[r] as number));
}

function toCells(m: Matrix): readonly Cell2D[] {
  const cells: Cell2D[] = [];
  m.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v === 1) cells.push([x, y]);
    }),
  );
  return cells;
}

function buildRotations(type: PieceType): readonly (readonly Cell2D[])[] {
  const out: (readonly Cell2D[])[] = [];
  let m = BASE[type];
  for (let i = 0; i < 4; i++) {
    out.push(toCells(m));
    m = rotateMatrixCW(m);
  }
  return out;
}

const CELLS: Record<PieceType, readonly (readonly Cell2D[])[]> = {
  I: buildRotations('I'),
  O: buildRotations('O'),
  T: buildRotations('T'),
  S: buildRotations('S'),
  Z: buildRotations('Z'),
  J: buildRotations('J'),
  L: buildRotations('L'),
};

/** Cell offsets (relative to the bounding box's top-left) for a piece and rotation. */
export function getCells(type: PieceType, rotation: Rotation): readonly Cell2D[] {
  return (CELLS[type] as readonly (readonly Cell2D[])[])[rotation] as readonly Cell2D[];
}

/** Horizontally centred spawn column. */
export function spawnX(type: PieceType): number {
  return Math.floor((BOARD_WIDTH - (BASE[type] as Matrix).length) / 2);
}

type Kick = readonly [x: number, yUp: number];

/** SRS wall-kick tables as published (y is UP). Converted to y-down by getKicks(). */
const JLSTZ_KICKS: Record<string, readonly Kick[]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const I_KICKS: Record<string, readonly Kick[]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

const NO_KICK: readonly Cell2D[] = [[0, 0]];

/** Kick offsets to try in order, as [dx, dy] with y pointing DOWN the board. */
export function getKicks(type: PieceType, from: Rotation, to: Rotation): readonly Cell2D[] {
  if (type === 'O') return NO_KICK;
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  const kicks = table[`${from}>${to}`] ?? NO_KICK;
  return kicks.map(([x, yUp]): Cell2D => [x, 0 - yUp]);
}
