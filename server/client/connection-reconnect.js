/**
 * @fileoverview Reconnection backoff and error throttling for api-ape client
 *
 * Provides exponential backoff for WebSocket reconnection attempts and
 * throttles repetitive error log messages to prevent terminal flooding
 * when the server is unreachable for extended periods.
 *
 * Backoff: 1s → 2s → 4s → 8s → 16s → 30s cap, with 20% jitter.
 * Error throttle: logs first error immediately, then suppresses
 * duplicates for 30 seconds (printing suppressed count on resume).
 *
 * @module server/client/connection-reconnect
 */

const { apeLog } = require("../../utils/apeLogger");

// Backoff bounds: start at 1 second, cap at 30 seconds.
// Jitter prevents thundering-herd if multiple clients reconnect
// simultaneously (e.g. after a gateway restart).
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const JITTER_FACTOR = 0.2;

// Error throttle: suppress repeated errors for this duration.
// Long enough to avoid terminal flooding on sustained outage,
// short enough that the operator sees periodic status updates.
const ERROR_THROTTLE_MS = 30000;

// Reconnection attempt counter — drives the exponential delay.
// Reset to 0 on successful connection via resetBackoff().
let reconnectAttempt = 0;

// Error throttle state: timestamp of last logged error and
// count of errors suppressed since that log.
let lastErrorLogTime = 0;
let suppressedErrorCount = 0;

/**
 * Schedule a reconnection attempt with exponential backoff and jitter.
 *
 * Delay formula: min(MIN_DELAY_MS * 2^attempt, MAX_DELAY_MS) + jitter.
 * Jitter is a random value between 0 and 20% of the computed delay,
 * preventing synchronized reconnection storms across clients.
 *
 * @param {function(): void} connectFn - The connect() function to call
 * @returns {ReturnType<typeof setTimeout>} Timer ID for cancellation
 */
function scheduleReconnect(connectFn) {
  // Exponential delay: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
  const baseDelay = Math.min(MIN_DELAY_MS * Math.pow(2, reconnectAttempt), MAX_DELAY_MS);

  // Add jitter: random 0–20% of base delay to spread reconnection
  // attempts across time when multiple clients hit the same outage.
  const jitter = Math.floor(Math.random() * baseDelay * JITTER_FACTOR);
  const delay = baseDelay + jitter;

  reconnectAttempt++;
  return setTimeout(connectFn, delay);
}

/**
 * Reset backoff state after a successful connection.
 *
 * Called from the ws.onopen handler. Resets the attempt counter so
 * the next disconnection starts backoff from 1 second again. If
 * errors were suppressed during the outage, logs the count so the
 * operator knows how many were hidden.
 */
function resetBackoff() {
  reconnectAttempt = 0;

  // If errors were suppressed during the outage, notify the
  // operator with the count so they know what was hidden.
  if (suppressedErrorCount > 0) {
    apeLog.error(
      `[api-ape client] Reconnected. (${suppressedErrorCount} similar error(s) suppressed during outage)`
    );
    suppressedErrorCount = 0;
  }
  lastErrorLogTime = 0;
}

/**
 * Determine whether an error message should be logged.
 *
 * Returns true for the first error and then after every 30-second
 * window. When returning true after suppression, includes the count
 * of suppressed errors in the next console.error() call by the
 * caller. When returning false, silently increments the suppressed
 * counter.
 *
 * @returns {{ log: boolean, suppressed: number }} Whether to log and
 *   how many errors were suppressed since the last log
 */
function shouldLogError() {
  const now = Date.now();

  // First error or throttle window expired — allow logging
  if (lastErrorLogTime === 0 || (now - lastErrorLogTime) >= ERROR_THROTTLE_MS) {
    const suppressed = suppressedErrorCount;
    lastErrorLogTime = now;
    suppressedErrorCount = 0;
    return { log: true, suppressed };
  }

  // Within throttle window — suppress this error
  suppressedErrorCount++;
  return { log: false, suppressed: 0 };
}

/**
 * Cancel a scheduled reconnection timer.
 *
 * @param {ReturnType<typeof setTimeout>|null} timerId - Timer from scheduleReconnect()
 */
function cancelReconnect(timerId) {
  if (timerId) clearTimeout(timerId);
}

module.exports = {
  scheduleReconnect,
  resetBackoff,
  shouldLogError,
  cancelReconnect,
};
