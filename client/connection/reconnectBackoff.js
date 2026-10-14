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

/**
 * Cap of the exponential part (ms). Jitter is added ON TOP of the capped value, so the
 * longest delay is `RECONNECT_MAX_MS * (1 + RECONNECT_JITTER_FACTOR)` = 36 s.
 * @type {number}
 */
export const RECONNECT_MAX_MS = 30000;

/**
 * Jitter: a random 0-20 % of the (capped) delay is added, never subtracted.
 * @type {number}
 */
export const RECONNECT_JITTER_FACTOR = 0.2;

/**
 * Compute delay for attempt `reconnectAttempt` (0 = first disconnect-driven retry).
 *
 * @param {number} reconnectAttempt - Number of prior backoff increments
 * @returns {number} Delay in milliseconds: 1 s, 2 s ... capped at 30 s, plus jitter of up to 20 %
 *   of that (so at most 36 s)
 */
export function reconnectDelayMs(reconnectAttempt) {
  const base = Math.min(
    RECONNECT_MIN_MS * Math.pow(2, reconnectAttempt),
    RECONNECT_MAX_MS,
  );
  const jitter = Math.floor(Math.random() * base * RECONNECT_JITTER_FACTOR);
  return base + jitter;
}

/** @type {number} */
export const PING_RETRY_MIN_MS = 500;

/**
 * Delay before the next reachability ping after one failed with a network error or
 * timeout (server down or restarting): 0.5 s, 1 s, 2 s ... capped at 30 s, plus jitter of up
 * to 20 % on top of the cap (so at most 36 s).
 *
 * @param {number} failedPings - Number of consecutive failed pings so far (0 = the first failure)
 * @returns {number} Delay in milliseconds: 0.5 s, 1 s ... capped at 30 s, plus jitter of up to 20 %
 *   of that (so at most 36 s)
 */
export function pingRetryDelayMs(failedPings) {
  const base = Math.min(PING_RETRY_MIN_MS * Math.pow(2, failedPings), RECONNECT_MAX_MS);
  const jitter = Math.floor(Math.random() * base * RECONNECT_JITTER_FACTOR);
  return base + jitter;
}
