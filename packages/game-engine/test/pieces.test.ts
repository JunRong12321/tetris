import { describe, expect, it } from 'vitest';
import { PIECE_TYPES, getCells, getKicks, spawnX } from '../src/index.ts';

describe('piece shapes', () => {
  it('every piece has exactly four cells in every rotation', () => {
    for (const type of PIECE_TYPES) {
      for (const rotation of [0, 1, 2, 3] as const) {
        expect(getCells(type, rotation)).toHaveLength(4);
      }
    }
  });

  it('T spawns pointing up', () => {
    expect(getCells('T', 0)).toEqual([[1, 0], [0, 1], [1, 1], [2, 1]]);
  });

  it('T rotated clockwise points right', () => {
    expect(getCells('T', 1)).toEqual([[1, 0], [1, 1], [2, 1], [1, 2]]);
  });

  it('I rotated clockwise is a vertical bar in column 2', () => {
    expect(getCells('I', 1)).toEqual([[2, 0], [2, 1], [2, 2], [2, 3]]);
  });

  it('O looks identical in all rotations', () => {
    for (const rotation of [1, 2, 3] as const) {
      expect(getCells('O', rotation)).toEqual(getCells('O', 0));
    }
  });

  it('spawns pieces horizontally centred', () => {
    expect(spawnX('I')).toBe(3);
    expect(spawnX('T')).toBe(3);
    expect(spawnX('O')).toBe(4);
  });
});

describe('wall kicks', () => {
  it('JLSTZ and I try five positions, O tries only one', () => {
    expect(getKicks('T', 0, 1)).toHaveLength(5);
    expect(getKicks('I', 0, 1)).toHaveLength(5);
    expect(getKicks('O', 0, 1)).toEqual([[0, 0]]);
  });

  it('converts the published y-up table to y-down', () => {
    // SRS 0>1 for JLSTZ: (-1,+1) means one column left and one row UP.
    expect(getKicks('T', 0, 1)[2]).toEqual([-1, -1]);
  });
});
