/**
 * @fileoverview Browser WebSocket reconnect delay (Phase 1 alignment with Node client)
 *
 * Domain context: Matches `server/client/connection-reconnect.js` caps so browser
 * and Node reconnect storms behave similarly after transient outages.
 *
 * Technical context: Pure helpers — caller owns attempt counter and timers.
 *
 * @module client/connection/reconnectBackoff
 */

/** @type {number} */
export const RECONNECT_MIN_MS = 1000;

/** @type {number} */
export const RECONNECT_MAX_MS = 30000;

/** @type {number} */
export const RECONNECT_JITTER_FACTOR = 0.2;

/**
 * Compute delay for attempt `reconnectAttempt` (0 = first disconnect-driven retry).
 *
 * @param {number} reconnectAttempt - Number of prior backoff increments
 * @returns {number} Delay in milliseconds (with jitter)
 */
export function reconnectDelayMs(reconnectAttempt) {
  const base = Math.min(
    RECONNECT_MIN_MS * Math.pow(2, reconnectAttempt),
    RECONNECT_MAX_MS,
  );
  const jitter = Math.floor(Math.random() * base * RECONNECT_JITTER_FACTOR);
  return base + jitter;
}
