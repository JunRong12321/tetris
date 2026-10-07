/** Board geometry. Row 0 is the TOP of the board; rows 0..19 are the hidden buffer. */
export const BOARD_WIDTH = 10;
export const VISIBLE_HEIGHT = 20;
export const BUFFER_HEIGHT = 20;
export const BOARD_HEIGHT = BUFFER_HEIGHT + VISIBLE_HEIGHT;

export const NEXT_QUEUE_SIZE = 5;

/** Lock delay ("extended placement"). See docs/RULESET.md. */
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;

/** Safety cap on gravity/lock iterations inside one tick() call. */
export const MAX_TICK_STEPS = 10_000;

/** Scoring (multiplied by level for line clears). */
export const LINE_CLEAR_SCORES = [0, 100, 300, 500, 800] as const;
export const SOFT_DROP_POINTS_PER_CELL = 1;
export const HARD_DROP_POINTS_PER_CELL = 2;
export const COMBO_POINTS = 50;
export const BACK_TO_BACK_NUMERATOR = 3;
export const BACK_TO_BACK_DENOMINATOR = 2;
export const LINES_PER_LEVEL = 10;
export const MAX_GRAVITY_LEVEL = 20;

/** Garbage lines sent per number of lines cleared (PRD FR-010). */
export const GARBAGE_PER_CLEAR = [0, 0, 1, 2, 4] as const;
/** Maximum garbage lines that can rise in a single lock. */
export const MAX_GARBAGE_PER_LOCK = 8;

/** Salt that separates the garbage-hole RNG stream from the piece RNG stream. */
export const GARBAGE_SEED_SALT = 0x9e3779b9;
