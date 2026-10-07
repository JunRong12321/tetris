import { PIECE_TYPES } from './types.ts';
import type { GeneratorState, PieceType } from './types.ts';

/** mulberry32: tiny, fast, deterministic 32-bit PRNG with a single-number state. */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** Uniform integer in [0, max). */
export function nextInt(state: number, max: number): { value: number; state: number } {
  const r = nextRandom(state);
  return { value: Math.floor(r.value * max), state: r.state };
}

export function createGenerator(seed: number): GeneratorState {
  return { rngState: seed >>> 0, bag: [] };
}

/** Standard 7-bag: every group of 7 pieces contains each tetromino exactly once. */
export function nextPiece(gen: GeneratorState): { piece: PieceType; generator: GeneratorState } {
  let rngState = gen.rngState;
  let bag = gen.bag;
  if (bag.length === 0) {
    const shuffled: PieceType[] = [...PIECE_TYPES];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const r = nextInt(rngState, i + 1);
      rngState = r.state;
      const tmp = shuffled[i] as PieceType;
      shuffled[i] = shuffled[r.value] as PieceType;
      shuffled[r.value] = tmp;
    }
    bag = shuffled;
  }
  const [piece, ...rest] = bag as PieceType[];
  return { piece: piece as PieceType, generator: { rngState, bag: rest } };
}
