import {
  BACK_TO_BACK_DENOMINATOR,
  BACK_TO_BACK_NUMERATOR,
  BOARD_WIDTH,
  BUFFER_HEIGHT,
  COMBO_POINTS,
  GARBAGE_PER_CLEAR,
  GARBAGE_SEED_SALT,
  HARD_DROP_POINTS_PER_CELL,
  LINES_PER_LEVEL,
  LINE_CLEAR_SCORES,
  LOCK_DELAY_MS,
  MAX_GARBAGE_PER_LOCK,
  MAX_GRAVITY_LEVEL,
  MAX_LOCK_RESETS,
  MAX_TICK_STEPS,
  NEXT_QUEUE_SIZE,
  SOFT_DROP_POINTS_PER_CELL,
} from './constants.ts';
import {
  clearFullRows,
  collides,
  createBoard,
  dropDistance,
  insertGarbage,
  isEntirelyInBuffer,
  isGrounded,
  lockPiece,
  pieceCells,
} from './board.ts';
import { spawnX } from './pieces.ts';
import { createGenerator, nextInt, nextPiece } from './rng.ts';
import { tryRotate } from './rotation.ts';
import type {
  ActivePiece,
  Board,
  Cell,
  GameEvent,
  GameOptions,
  GameOverReason,
  GameState,
  PieceType,
  PlayerAction,
  StepResult,
} from './types.ts';

/** Internal mutable working copy; public functions never mutate their input. */
type Draft = { -readonly [K in keyof GameState]: GameState[K] };

/** Milliseconds per one-row gravity step (Tetris Guideline curve, capped at level 20). */
export function gravityIntervalMs(level: number): number {
  const l = Math.min(Math.max(1, Math.floor(level)), MAX_GRAVITY_LEVEL);
  return Math.max(1, 1000 * (0.8 - (l - 1) * 0.007) ** (l - 1));
}

export function createGame(seed: number, options: GameOptions = {}): GameState {
  const startLevel = Math.max(1, Math.floor(options.startLevel ?? 1));
  let generator = createGenerator(seed);
  const queue: PieceType[] = [];
  while (queue.length < NEXT_QUEUE_SIZE) {
    const drawn = nextPiece(generator);
    generator = drawn.generator;
    queue.push(drawn.piece);
  }
  const draft: Draft = {
    status: 'playing',
    gameOverReason: null,
    board: createBoard(),
    active: null,
    hold: null,
    holdUsed: false,
    queue,
    generator,
    garbageRngState: (seed ^ GARBAGE_SEED_SALT) >>> 0,
    score: 0,
    lines: 0,
    startLevel,
    level: startLevel,
    combo: -1,
    backToBack: false,
    pendingGarbage: 0,
    gravityAccumMs: 0,
    lockTimerMs: null,
    lockResets: 0,
    lowestY: 0,
    piecesPlaced: 0,
    garbageSent: 0,
  };
  spawnNext(draft, []);
  return draft;
}

/** Apply one player intention. Illegal or irrelevant actions return the state unchanged. */
export function applyAction(state: GameState, action: PlayerAction): StepResult {
  const events: GameEvent[] = [];
  if (state.status !== 'playing' || state.active === null) return { state, events };
  const s: Draft = { ...state };

  switch (action) {
    case 'MOVE_LEFT':
      shift(s, -1);
      break;
    case 'MOVE_RIGHT':
      shift(s, 1);
      break;
    case 'SOFT_DROP':
      softDrop(s);
      break;
    case 'HARD_DROP':
      hardDrop(s, events);
      break;
    case 'ROTATE_CW':
      rotate(s, 1);
      break;
    case 'ROTATE_CCW':
      rotate(s, -1);
      break;
    case 'HOLD':
      hold(s, events);
      break;
  }
  return { state: s, events };
}

/** Advance time: gravity and lock delay. `dtMs` is simulated (not wall-clock) time. */
export function tick(state: GameState, dtMs: number): StepResult {
  const events: GameEvent[] = [];
  if (state.status !== 'playing' || !Number.isFinite(dtMs) || dtMs <= 0) {
    return { state, events };
  }
  const s: Draft = { ...state };
  let remaining = dtMs;
  let steps = 0;

  while (remaining > 0 && s.status === 'playing' && s.active !== null && steps++ < MAX_TICK_STEPS) {
    const piece = s.active;
    if (isGrounded(s.board, piece)) {
      const timer = s.lockTimerMs ?? 0;
      const needed = LOCK_DELAY_MS - timer;
      if (remaining >= needed) {
        remaining -= needed;
        lockActive(s, events);
      } else {
        s.lockTimerMs = timer + remaining;
        remaining = 0;
      }
    } else {
      s.lockTimerMs = null;
      const needed = gravityIntervalMs(s.level) - s.gravityAccumMs;
      if (remaining >= needed) {
        remaining -= needed;
        s.gravityAccumMs = 0;
        s.active = { ...piece, y: piece.y + 1 };
        if (s.active.y > s.lowestY) {
          s.lowestY = s.active.y;
          s.lockResets = 0;
        }
      } else {
        s.gravityAccumMs += remaining;
        remaining = 0;
      }
    }
  }
  return { state: s, events };
}

/** Queue garbage lines (sent by the opponent). They rise after the next non-clearing lock. */
export function receiveGarbage(state: GameState, lines: number): GameState {
  if (state.status !== 'playing' || !Number.isInteger(lines) || lines <= 0) return state;
  return { ...state, pendingGarbage: state.pendingGarbage + lines };
}

/** Where the active piece would land on a hard drop. */
export function getGhostPiece(state: GameState): ActivePiece | null {
  if (state.active === null) return null;
  return { ...state.active, y: state.active.y + dropDistance(state.board, state.active) };
}

/** The board with the active piece overlaid (for rendering / snapshots). */
export function getRenderBoard(state: GameState): Board {
  if (state.active === null) return state.board;
  const rows = state.board.map((row) => [...row]);
  for (const [x, y] of pieceCells(state.active)) {
    (rows[y] as Cell[])[x] = state.active.type;
  }
  return rows;
}

/** Only the 20 visible rows of a board. */
export function getVisibleBoard(board: Board): Board {
  return board.slice(BUFFER_HEIGHT);
}

// ---------------------------------------------------------------- internals

function endGame(s: Draft, reason: GameOverReason, events: GameEvent[]): void {
  s.status = 'gameover';
  s.gameOverReason = reason;
  s.active = null;
  s.lockTimerMs = null;
  events.push({ type: 'GAME_OVER', reason });
}

function spawn(s: Draft, type: PieceType, events: GameEvent[]): void {
  const piece: ActivePiece = { type, x: spawnX(type), y: BUFFER_HEIGHT - 1, rotation: 0 };
  s.gravityAccumMs = 0;
  s.lockTimerMs = null;
  s.lockResets = 0;
  s.lowestY = piece.y;
  if (collides(s.board, piece)) {
    endGame(s, 'BLOCK_OUT', events);
    return;
  }
  s.active = piece;
}

function spawnNext(s: Draft, events: GameEvent[]): void {
  const [type, ...rest] = s.queue as PieceType[];
  const drawn = nextPiece(s.generator);
  s.generator = drawn.generator;
  s.queue = [...rest, drawn.piece];
  spawn(s, type as PieceType, events);
}

/** Bookkeeping after a successful move/rotation (extended-placement lock reset). */
function afterAdjust(s: Draft): void {
  const piece = s.active;
  if (piece === null) return;
  if (piece.y > s.lowestY) {
    s.lowestY = piece.y;
    s.lockResets = 0;
  }
  const wasLocking = s.lockTimerMs !== null;
  if (!isGrounded(s.board, piece)) {
    s.lockTimerMs = null;
    if (wasLocking) s.lockResets += 1;
  } else if (wasLocking && s.lockResets < MAX_LOCK_RESETS) {
    s.lockTimerMs = 0;
    s.lockResets += 1;
  }
}

function shift(s: Draft, dx: -1 | 1): void {
  const piece = s.active;
  if (piece === null) return;
  const moved: ActivePiece = { ...piece, x: piece.x + dx };
  if (collides(s.board, moved)) return;
  s.active = moved;
  afterAdjust(s);
}

function softDrop(s: Draft): void {
  const piece = s.active;
  if (piece === null) return;
  const moved: ActivePiece = { ...piece, y: piece.y + 1 };
  if (collides(s.board, moved)) return;
  s.active = moved;
  s.score += SOFT_DROP_POINTS_PER_CELL;
  s.gravityAccumMs = 0;
  afterAdjust(s);
}

function hardDrop(s: Draft, events: GameEvent[]): void {
  const piece = s.active;
  if (piece === null) return;
  const distance = dropDistance(s.board, piece);
  s.active = { ...piece, y: piece.y + distance };
  s.score += HARD_DROP_POINTS_PER_CELL * distance;
  lockActive(s, events);
}

function rotate(s: Draft, direction: 1 | -1): void {
  const piece = s.active;
  if (piece === null) return;
  const rotated = tryRotate(s.board, piece, direction);
  if (rotated === null) return;
  s.active = rotated;
  afterAdjust(s);
}

function hold(s: Draft, events: GameEvent[]): void {
  const piece = s.active;
  if (piece === null || s.holdUsed) return;
  const previous = s.hold;
  s.hold = piece.type;
  s.holdUsed = true;
  events.push({ type: 'HOLD' });
  if (previous === null) {
    spawnNext(s, events);
  } else {
    spawn(s, previous, events);
  }
}

function lockActive(s: Draft, events: GameEvent[]): void {
  const piece = s.active;
  if (piece === null) return;
  s.board = lockPiece(s.board, piece);
  s.active = null;
  s.lockTimerMs = null;
  s.holdUsed = false;
  s.piecesPlaced += 1;
  events.push({ type: 'LOCK', piece: piece.type });

  if (isEntirelyInBuffer(piece)) {
    endGame(s, 'LOCK_OUT', events);
    return;
  }

  const result = clearFullRows(s.board);
  s.board = result.board;
  if (result.cleared > 0) {
    resolveClear(s, result.cleared, events);
  } else {
    s.combo = -1;
    applyPendingGarbage(s, events);
    if (s.status !== 'playing') return;
  }
  spawnNext(s, events);
}

function resolveClear(s: Draft, cleared: number, events: GameEvent[]): void {
  events.push({ type: 'LINES_CLEARED', count: cleared });

  s.combo += 1;
  let points = LINE_CLEAR_SCORES[cleared as 1 | 2 | 3 | 4] * s.level;
  if (cleared === 4 && s.backToBack) {
    points = Math.floor((points * BACK_TO_BACK_NUMERATOR) / BACK_TO_BACK_DENOMINATOR);
  }
  s.backToBack = cleared === 4;
  if (s.combo > 0) points += COMBO_POINTS * s.combo * s.level;
  s.score += points;
  s.lines += cleared;
  s.level = s.startLevel + Math.floor(s.lines / LINES_PER_LEVEL);

  // Attacks first cancel our own pending garbage; the remainder goes to the opponent.
  const attack = GARBAGE_PER_CLEAR[cleared as 1 | 2 | 3 | 4];
  const offset = Math.min(attack, s.pendingGarbage);
  s.pendingGarbage -= offset;
  const sent = attack - offset;
  if (sent > 0) {
    s.garbageSent += sent;
    events.push({ type: 'ATTACK', lines: sent });
  }
}

function applyPendingGarbage(s: Draft, events: GameEvent[]): void {
  const lines = Math.min(s.pendingGarbage, MAX_GARBAGE_PER_LOCK);
  if (lines <= 0) return;
  const hole = nextInt(s.garbageRngState, BOARD_WIDTH);
  s.garbageRngState = hole.state;
  const result = insertGarbage(s.board, lines, hole.value);
  s.board = result.board;
  s.pendingGarbage -= lines;
  events.push({ type: 'GARBAGE_RECEIVED', lines });
  if (result.overflow) endGame(s, 'TOP_OUT', events);
}
