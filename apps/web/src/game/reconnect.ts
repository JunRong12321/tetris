/**
 * Reconnect schedule for the battle socket.
 *
 * Sized to outlast a cold start on a free-tier host, which can take around a
 * minute: the total wait is roughly 1 + 2 + 4 + 8 * 9 = 79 seconds.
 */
export const MAX_RECONNECT_ATTEMPTS = 12;

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 8000;

/** Delay before reconnect attempt `attempt` (1-based). */
export function nextReconnectDelay(attempt: number): number {
  const safe = Math.max(1, Math.floor(attempt));
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (safe - 1));
}
