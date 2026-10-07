# Gameplay Ruleset v0.1 (proposed — needs approval)

The PRD lists "Exact Tetris ruleset" as a decision requiring approval. This document records
what `packages/game-engine` implements today. Per AGENT_INSTRUCTIONS §15, change the engine and
this file together. Items marked **(default)** are choices the PRD did not specify.

## Board
- 10 columns × 20 visible rows, plus 20 hidden buffer rows above (40 total, row 0 = top).
- Pieces spawn centred in the buffer/visible boundary (rows 19–20), rotation state 0.

## Pieces and randomness
- Seven tetrominoes (I O T S Z J L), standard **7-bag** from a seeded PRNG (mulberry32).
- Both players in a match should be created with the **same seed** so they get the same sequence.
- Garbage hole columns use a separate PRNG stream derived from the same seed **(default)**.
- Next queue: 5 pieces. Hold: 1 piece, once per spawned piece.

## Rotation
- **SRS** rotation with the standard 5-test wall-kick tables (separate table for I; O never kicks).
- No 180° rotation.

## Gravity and locking
- Gravity per level: `(0.8 − (level − 1) × 0.007)^(level − 1)` seconds per row, capped at level 20.
- Soft drop: 1 row per `SOFT_DROP` action (+1 point per row). Hard drop: instant lock (+2 per row).
- Lock delay **500 ms** once grounded. Successful move/rotate while locking resets the timer, up to
  **15 resets** per piece; the counter resets whenever the piece reaches a new lowest row **(default)**.

## Scoring (× level for line clears) **(default: Tetris Guideline)**
| Clear | Points |
|---|---:|
| Single | 100 |
| Double | 300 |
| Triple | 500 |
| Tetris | 800 |

- Back-to-back Tetris: ×1.5. Any 1–3 line clear breaks it; locks without a clear do not.
- Combo: `50 × combo × level` for each consecutive clearing lock after the first.
- Level = start level + ⌊lines ÷ 10⌋.
- **No T-spin detection in this version** (PRD allows deferring it behind a flag).

## Garbage (PRD FR-010)
| Lines cleared | Garbage sent |
|---|---:|
| 1 | 0 |
| 2 | 1 |
| 3 | 2 |
| 4 | 4 |

- **Offsetting (default):** a clear first cancels the clearer's own pending garbage; only the
  remainder is sent to the opponent.
- Pending garbage rises after the next lock that clears **no** lines **(default)**.
- At most **8** lines rise per lock; the rest stays queued **(default)**.
- All lines raised in one batch share one hole column.

## Game over
- **Block out:** the next piece cannot spawn.
- **Lock out:** a piece locks entirely inside the hidden buffer rows.
- **Top out:** rising garbage pushes blocks off the top of the board.
