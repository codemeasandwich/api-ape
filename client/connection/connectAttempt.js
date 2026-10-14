/**
 * @fileoverview "One connection attempt at a time" guard for the browser client.
 *
 * An attempt runs from the reachability ping until the socket opens, errors or
 * closes. While one is in flight, every other request to connect is a no-op. That
 * matters because every queued call asks the client to connect: without the guard,
 * N calls made before the first connect opened N+1 sockets (4.3.0).
 *
 * A stuck attempt can never block connecting forever: the flag expires after
 * `maxMs` (default 15 s: ping 3 s + WebSocket fallback window 4 s + margin).
 *
 * @module client/connection/connectAttempt
 * @see {@link module:client/connectSocket} for the caller
 */

/**
 * Longest an attempt may hold the "in flight" flag (ms).
 * @constant {number}
 */
export const CONNECT_ATTEMPT_MAX_MS = 15000;

/**
 * Create the guard.
 *
 * @param {number} [maxMs=CONNECT_ATTEMPT_MAX_MS] - How long a started attempt counts as in flight
 * @returns {{inFlight: function(): boolean, start: function(): void, end: function(): void}}
 *   `inFlight()` is true from `start()` until `end()` or `maxMs`
 */
export function createConnectAttempt(maxMs = CONNECT_ATTEMPT_MAX_MS) {
  let since = 0;
  return {
    /**
     * Whether an attempt is in flight.
     * @returns {boolean} True while an attempt started less than `maxMs` ago and has not ended
     */
    inFlight: () => since > 0 && Date.now() - since < maxMs,
    /**
     * Mark an attempt as started.
     * @returns {void}
     */
    start: () => {
      since = Date.now();
    },
    /**
     * Mark the attempt as finished (opened, failed or closed).
     * @returns {void}
     */
    end: () => {
      since = 0;
    },
  };
}
