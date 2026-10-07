import { describe, expect, it } from 'vitest';
import {
  BOARD_HEIGHT,
  BUFFER_HEIGHT,
  LOCK_DELAY_MS,
  NEXT_QUEUE_SIZE,
  PLAYER_ACTIONS,
  applyAction,
  createGame,
  getGhostPiece,
  gravityIntervalMs,
  receiveGarbage,
  tick,
} from '../src/index.ts';
import type { GameState, PlayerAction } from '../src/index.ts';
import { makeBoard, stateWith } from './helpers.ts';

const act = (s: GameState, a: PlayerAction) => applyAction(s, a);

describe('new game', () => {
  it('spawns a piece at the top of the visible area with a full next queue', () => {
    const s = createGame(1);
    expect(s.status).toBe('playing');
    expect(s.active).not.toBeNull();
    expect(s.active?.y).toBe(BUFFER_HEIGHT - 1);
    expect(s.queue).toHaveLength(NEXT_QUEUE_SIZE);
    expect(s.score).toBe(0);
    expect(s.level).toBe(1);
  });

  it('first piece is the head of the seeded sequence', () => {
    const a = createGame(99);
    const b = createGame(99);
    expect(a.active?.type).toBe(b.active?.type);
    expect(a.queue).toEqual(b.queue);
  });
});

describe('movement', () => {
  it('moves left and right', () => {
    const s = createGame(1);
    const x = s.active?.x ?? 0;
    expect(act(s, 'MOVE_LEFT').state.active?.x).toBe(x - 1);
    expect(act(s, 'MOVE_RIGHT').state.active?.x).toBe(x + 1);
  });

  it('cannot move through the wall', () => {
    let s = stateWith({ active: { type: 'T', x: 0, y: 30, rotation: 0 } });
    s = act(s, 'MOVE_LEFT').state;
    expect(s.active?.x).toBe(0);
  });

  it('does not mutate the previous state', () => {
    const s = createGame(1);
    const before = JSON.stringify(s);
    act(s, 'MOVE_LEFT');
    act(s, 'HARD_DROP');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('soft drop moves one row down and scores one point', () => {
    const s = stateWith({ active: { type: 'T', x: 3, y: 30, rotation: 0 } });
    const r = act(s, 'SOFT_DROP').state;
    expect(r.active?.y).toBe(31);
    expect(r.score).toBe(1);
  });

  it('hard drop lands on the floor, scores 2 per cell and spawns the next piece', () => {
    const s = stateWith({ active: { type: 'O', x: 4, y: 30, rotation: 0 } });
    const { state, events } = act(s, 'HARD_DROP');
    expect(state.board[BOARD_HEIGHT - 1]?.[4]).toBe('O');
    expect(state.score).toBe(16);
    expect(state.piecesPlaced).toBe(1);
    expect(state.active).not.toBeNull();
    expect(events).toContainEqual({ type: 'LOCK', piece: 'O' });
  });

  it('ghost piece matches where a hard drop lands', () => {
    const s = stateWith({ active: { type: 'O', x: 4, y: 30, rotation: 0 } });
    expect(getGhostPiece(s)?.y).toBe(BOARD_HEIGHT - 2);
  });
});

describe('rotation', () => {
  it('rotates freely in open space', () => {
    const s = stateWith({ active: { type: 'T', x: 3, y: 30, rotation: 0 } });
    expect(act(s, 'ROTATE_CW').state.active?.rotation).toBe(1);
    expect(act(s, 'ROTATE_CCW').state.active?.rotation).toBe(3);
  });

  it('kicks off a wall instead of failing (SRS)', () => {
    // T in state R at the left wall rotating to state 2 needs the (+1, 0) kick.
    const s = stateWith({ active: { type: 'T', x: -1, y: 30, rotation: 1 } });
    const r = act(s, 'ROTATE_CW').state.active;
    expect(r?.rotation).toBe(2);
    expect(r?.x).toBe(0);
  });

  it('fails when every kick is blocked', () => {
    // A horizontal I in a one-row corridor: every vertical orientation hits solid rows.
    const board = makeBoard({ 30: [], 31: [], 32: [], 33: [], 34: [], 35: [], 36: [], 37: [], 39: [] });
    const s = stateWith({ board, active: { type: 'I', x: 3, y: 37, rotation: 0 } });
    const r = act(s, 'ROTATE_CW');
    expect(r.state.active).toEqual(s.active);
  });
});

describe('hold', () => {
  it('stores the active piece and spawns the next one', () => {
    const s = createGame(5);
    const first = s.active?.type;
    const nextUp = s.queue[0];
    const { state, events } = act(s, 'HOLD');
    expect(state.hold).toBe(first);
    expect(state.active?.type).toBe(nextUp);
    expect(events).toContainEqual({ type: 'HOLD' });
  });

  it('can only be used once per piece', () => {
    const once = act(createGame(5), 'HOLD').state;
    const twice = act(once, 'HOLD').state;
    expect(twice.active).toEqual(once.active);
    expect(twice.hold).toBe(once.hold);
  });

  it('swaps with the held piece after the next lock', () => {
    let s = act(createGame(5), 'HOLD').state;
    const held = s.hold;
    s = act(s, 'HARD_DROP').state;
    const current = s.active?.type;
    s = act(s, 'HOLD').state;
    expect(s.active?.type).toBe(held);
    expect(s.hold).toBe(current);
  });
});

describe('line clears and scoring', () => {
  it('single: 100 points, no garbage sent', () => {
    const board = makeBoard({ 39: [3, 4, 5, 6] });
    const s = stateWith({ board, active: { type: 'I', x: 3, y: 38, rotation: 0 } });
    const { state, events } = act(s, 'HARD_DROP');
    expect(state.lines).toBe(1);
    expect(state.score).toBe(100);
    expect(events).toContainEqual({ type: 'LINES_CLEARED', count: 1 });
    expect(events.some((e) => e.type === 'ATTACK')).toBe(false);
  });

  it('double sends 1 garbage line', () => {
    const board = makeBoard({ 38: [4, 5], 39: [4, 5] });
    const s = stateWith({ board, active: { type: 'O', x: 4, y: 38, rotation: 0 } });
    const { state, events } = act(s, 'HARD_DROP');
    expect(state.score).toBe(300);
    expect(events).toContainEqual({ type: 'ATTACK', lines: 1 });
    expect(state.garbageSent).toBe(1);
  });

  it('tetris scores 800 and sends 4 garbage lines', () => {
    const board = makeBoard({ 36: [9], 37: [9], 38: [9], 39: [9] });
    const s = stateWith({ board, active: { type: 'I', x: 7, y: 36, rotation: 1 } });
    const { state, events } = act(s, 'HARD_DROP');
    expect(state.lines).toBe(4);
    expect(state.score).toBe(800);
    expect(events).toContainEqual({ type: 'ATTACK', lines: 4 });
    expect(state.backToBack).toBe(true);
  });

  it('back-to-back tetris earns a 1.5x bonus', () => {
    const board = makeBoard({ 36: [9], 37: [9], 38: [9], 39: [9] });
    const s = stateWith({
      board,
      backToBack: true,
      combo: -1,
      active: { type: 'I', x: 7, y: 36, rotation: 1 },
    });
    expect(act(s, 'HARD_DROP').state.score).toBe(1200);
  });

  it('consecutive clears build a combo bonus', () => {
    const board = makeBoard({ 39: [3, 4, 5, 6] });
    const s = stateWith({ board, combo: 0, active: { type: 'I', x: 3, y: 38, rotation: 0 } });
    // single (100) + combo 1 * 50 * level 1
    expect(act(s, 'HARD_DROP').state.score).toBe(150);
  });

  it('advances the level every ten lines', () => {
    const board = makeBoard({ 39: [3, 4, 5, 6] });
    const s = stateWith({ board, lines: 9, active: { type: 'I', x: 3, y: 38, rotation: 0 } });
    expect(act(s, 'HARD_DROP').state.level).toBe(2);
  });
});

describe('garbage', () => {
  it('rises after a lock that clears nothing, with one shared hole', () => {
    const queued = receiveGarbage(stateWith({ active: { type: 'O', x: 0, y: 30, rotation: 0 } }), 2);
    expect(queued.pendingGarbage).toBe(2);
    const { state, events } = act(queued, 'HARD_DROP');
    expect(state.pendingGarbage).toBe(0);
    expect(events).toContainEqual({ type: 'GARBAGE_RECEIVED', lines: 2 });

    const bottom = state.board[39] ?? [];
    const above = state.board[38] ?? [];
    const hole = bottom.findIndex((c) => c === null);
    expect(hole).toBeGreaterThan(-1);
    expect(bottom.filter((c) => c === 'G')).toHaveLength(9);
    expect(above.findIndex((c) => c === null)).toBe(hole); // same hole in both rows
    expect(above.filter((c) => c === 'G')).toHaveLength(9);
    // The O we dropped was pushed up two rows and still sits at columns 0-1.
    expect(state.board[36]?.[0]).toBe('O');
    expect(state.board[37]?.[1]).toBe('O');
  });

  it('is cancelled by our own attacks before being sent', () => {
    const board = makeBoard({ 38: [4, 5], 39: [4, 5] });
    const s = receiveGarbage(
      stateWith({ board, active: { type: 'O', x: 4, y: 38, rotation: 0 } }),
      3,
    );
    const { state, events } = act(s, 'HARD_DROP');
    expect(state.pendingGarbage).toBe(2); // 3 pending - 1 attack
    expect(events.some((e) => e.type === 'ATTACK')).toBe(false);
    expect(state.garbageSent).toBe(0);
  });

  it('ignores invalid garbage amounts', () => {
    const s = createGame(1);
    expect(receiveGarbage(s, 0)).toBe(s);
    expect(receiveGarbage(s, -3)).toBe(s);
    expect(receiveGarbage(s, 1.5)).toBe(s);
  });
});

describe('gravity and lock delay', () => {
  it('level 1 drops one row per second', () => {
    expect(gravityIntervalMs(1)).toBe(1000);
    const s = stateWith({ active: { type: 'T', x: 3, y: 25, rotation: 0 } });
    expect(tick(s, 999).state.active?.y).toBe(25);
    expect(tick(s, 1000).state.active?.y).toBe(26);
    expect(tick(s, 3000).state.active?.y).toBe(28);
  });

  it('gets faster with level but never reaches zero', () => {
    expect(gravityIntervalMs(2)).toBeLessThan(gravityIntervalMs(1));
    expect(gravityIntervalMs(30)).toBeGreaterThan(0);
  });

  it('locks a grounded piece only after the lock delay', () => {
    const s = stateWith({ active: { type: 'O', x: 4, y: 38, rotation: 0 } });
    const early = tick(s, LOCK_DELAY_MS - 1).state;
    expect(early.piecesPlaced).toBe(0);
    const late = tick(early, 1).state;
    expect(late.piecesPlaced).toBe(1);
  });

  it('moving a grounded piece resets the lock timer', () => {
    const s = stateWith({ active: { type: 'O', x: 4, y: 38, rotation: 0 } });
    let r = tick(s, LOCK_DELAY_MS - 10).state;
    r = act(r, 'MOVE_LEFT').state;
    expect(r.lockTimerMs).toBe(0);
    expect(tick(r, LOCK_DELAY_MS - 10).state.piecesPlaced).toBe(0);
  });

  it('stops resetting after the maximum number of resets', () => {
    let s = tick(stateWith({ active: { type: 'O', x: 4, y: 38, rotation: 0 } }), 1).state;
    for (let i = 0; i < 40; i++) {
      s = act(s, i % 2 === 0 ? 'MOVE_LEFT' : 'MOVE_RIGHT').state;
    }
    expect(s.lockResets).toBe(15);
    expect(tick(s, LOCK_DELAY_MS).state.piecesPlaced).toBe(1);
  });

  it('ignores zero, negative and non-finite time', () => {
    const s = createGame(1);
    expect(tick(s, 0).state).toBe(s);
    expect(tick(s, -5).state).toBe(s);
    expect(tick(s, Number.NaN).state).toBe(s);
  });
});

describe('game over', () => {
  it('blocks out when the next piece cannot spawn', () => {
    const board = makeBoard({ 20: [0, 1, 2, 7, 8, 9], 21: [0, 1, 2, 7, 8, 9] });
    const s = stateWith({ board, active: { type: 'O', x: 0, y: 38, rotation: 0 } });
    const { state, events } = act(s, 'HARD_DROP');
    expect(state.status).toBe('gameover');
    expect(state.gameOverReason).toBe('BLOCK_OUT');
    expect(events).toContainEqual({ type: 'GAME_OVER', reason: 'BLOCK_OUT' });
  });

  it('locks out when a piece rests entirely above the visible area', () => {
    const board = makeBoard({ 20: [] }); // solid row right at the top of the visible area
    const s = stateWith({ board, active: { type: 'O', x: 4, y: 18, rotation: 0 } });
    const { state, events } = act(s, 'HARD_DROP');
    expect(state.status).toBe('gameover');
    expect(state.gameOverReason).toBe('LOCK_OUT');
    expect(events).toContainEqual({ type: 'GAME_OVER', reason: 'LOCK_OUT' });
  });

  it('ignores all input once the game is over', () => {
    const over = stateWith({ status: 'gameover', gameOverReason: 'BLOCK_OUT', active: null });
    for (const action of PLAYER_ACTIONS) {
      expect(act(over, action).state).toBe(over);
    }
    expect(tick(over, 1000).state).toBe(over);
  });
});

describe('determinism', () => {
  function play(seed: number, steps: number): GameState {
    let s = createGame(seed);
    let r = seed >>> 0;
    for (let i = 0; i < steps && s.status === 'playing'; i++) {
      r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
      const action = PLAYER_ACTIONS[r % PLAYER_ACTIONS.length] as PlayerAction;
      s = applyAction(s, action).state;
      if (i % 5 === 0) s = tick(s, 137).state;
    }
    return s;
  }

  it('same seed + same inputs gives the identical state', () => {
    expect(JSON.stringify(play(1234, 400))).toBe(JSON.stringify(play(1234, 400)));
  });

  it('different seeds diverge', () => {
    expect(JSON.stringify(play(1, 50))).not.toBe(JSON.stringify(play(2, 50)));
  });
});
