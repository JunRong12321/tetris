import { describe, expect, it } from 'vitest';
import { PIECE_TYPES, createGenerator, nextPiece } from '../src/index.ts';
import type { PieceType } from '../src/index.ts';

function draw(seed: number, count: number): PieceType[] {
  let gen = createGenerator(seed);
  const out: PieceType[] = [];
  for (let i = 0; i < count; i++) {
    const r = nextPiece(gen);
    gen = r.generator;
    out.push(r.piece);
  }
  return out;
}

describe('7-bag generator', () => {
  it('deals every tetromino exactly once per group of seven', () => {
    const pieces = draw(42, 70);
    for (let i = 0; i < pieces.length; i += 7) {
      const bag = pieces.slice(i, i + 7);
      expect([...bag].sort()).toEqual([...PIECE_TYPES].sort());
    }
  });

  it('is deterministic for the same seed', () => {
    expect(draw(7, 50)).toEqual(draw(7, 50));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(1, 70)).not.toEqual(draw(2, 70));
  });
});
