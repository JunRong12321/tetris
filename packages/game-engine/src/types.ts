export const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;
export type PieceType = (typeof PIECE_TYPES)[number];

/** A board cell: a locked tetromino colour, 'G' for garbage, or empty. */
export type Cell = PieceType | 'G' | null;
export type Row = readonly Cell[];
export type Board = readonly Row[];

/** 0 = spawn, 1 = clockwise (R), 2 = 180°, 3 = counter-clockwise (L). */
export type Rotation = 0 | 1 | 2 | 3;

export interface ActivePiece {
  readonly type: PieceType;
  /** Left edge of the piece's bounding box. */
  readonly x: number;
  /** Top edge of the piece's bounding box (row 0 = top of board). */
  readonly y: number;
  readonly rotation: Rotation;
}

export const PLAYER_ACTIONS = [
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'SOFT_DROP',
  'HARD_DROP',
  'ROTATE_CW',
  'ROTATE_CCW',
  'HOLD',
] as const;
export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

export type GameStatus = 'playing' | 'gameover';
export type GameOverReason = 'BLOCK_OUT' | 'LOCK_OUT' | 'TOP_OUT';

export interface GeneratorState {
  readonly rngState: number;
  readonly bag: readonly PieceType[];
}

export interface GameState {
  readonly status: GameStatus;
  readonly gameOverReason: GameOverReason | null;
  readonly board: Board;
  readonly active: ActivePiece | null;
  readonly hold: PieceType | null;
  readonly holdUsed: boolean;
  /** Upcoming pieces; always NEXT_QUEUE_SIZE long while the game is running. */
  readonly queue: readonly PieceType[];
  readonly generator: GeneratorState;
  readonly garbageRngState: number;
  readonly score: number;
  readonly lines: number;
  readonly startLevel: number;
  readonly level: number;
  /** Consecutive line-clearing locks minus one; -1 when no combo is running. */
  readonly combo: number;
  readonly backToBack: boolean;
  /** Garbage lines waiting to rise after the next non-clearing lock. */
  readonly pendingGarbage: number;
  readonly gravityAccumMs: number;
  /** Milliseconds the piece has been grounded; null if not counting. */
  readonly lockTimerMs: number | null;
  readonly lockResets: number;
  /** Lowest row the active piece has reached (resets the lock-reset counter). */
  readonly lowestY: number;
  readonly piecesPlaced: number;
  readonly garbageSent: number;
}

export type GameEvent =
  | { readonly type: 'LOCK'; readonly piece: PieceType }
  | { readonly type: 'LINES_CLEARED'; readonly count: number }
  | { readonly type: 'ATTACK'; readonly lines: number }
  | { readonly type: 'GARBAGE_RECEIVED'; readonly lines: number }
  | { readonly type: 'HOLD' }
  | { readonly type: 'GAME_OVER'; readonly reason: GameOverReason };

export interface StepResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export interface GameOptions {
  /** Starting level (default 1). */
  readonly startLevel?: number;
}
