/**
 * @fileoverview The offset between a client's clock and its server's, read from the
 * `__connected__` frame.
 *
 * Domain context: the server refuses a call whose `createdAt` is more than `maxClockSkewMs`
 * ahead of its own clock, or more than 10 s behind it. A client whose clock is minutes off
 * would be refused for ever, so since 4.5.1 the server puts its time in `__connected__`
 * (`serverTime`, epoch ms) and the bundled clients stamp calls in the server's clock.
 *
 * Technical context: the offset is `serverTime - localNow` at the moment the frame arrives.
 * It leaves out the frame's travel time, so the estimate is a little behind the server's
 * real clock: the safe side, since the server tolerates 10 s of lateness. An older server
 * sends no `serverTime`, and the offset is 0: the old behaviour, a stamp in the client's
 * own clock. Every `__connected__` recomputes it, so a reconnect to a different server
 * never keeps the last one's offset. Used by `client/connectSocket.js` (browser) and
 * `server/client/connection.js` (server-side client); no Node APIs, so it bundles.
 *
 * `createServerClock` bundles the two for the server-side client.
 *
 * The frame is the first thing a server sends, but a client's socket opens before it
 * arrives, and calls queued while connecting used to go out at that moment, stamped in the
 * client's clock. `createConnectedGate` holds that flush until the frame is in (or a
 * second passes without one: a server that never sends it must not stall calls).
 *
 * @module utils/clockOffset
 */

/**
 * Offset to add to the local clock to read the server's.
 *
 * @param {*} connected - The `__connected__` frame's data (`{ clientId, sessionId, serverTime? }`)
 * @param {number} [localNow=Date.now()] - The local clock when the frame arrived
 * @returns {number} Milliseconds to add to `Date.now()`; 0 when the server sent no usable time
 */
function clockOffsetFrom(connected, localNow = Date.now()) {
  const serverTime = connected && connected.serverTime;
  return typeof serverTime === "number" && Number.isFinite(serverTime) ? serverTime - localNow : 0;
}

/** How long a client waits after its socket opens for `__connected__` before it sends queued calls anyway. */
const CONNECTED_WAIT_MS = 1000;

/**
 * Holds a socket's queued calls from "socket open" until `__connected__` arrives, so they
 * are stamped with the server's clock. Calls made meanwhile queue too (`isWaiting()`), which
 * keeps them in order behind the earlier ones.
 *
 * @param {function(): void} onSettled - Sends the queued calls; runs once per `begin()`
 * @param {number} [waitMs=CONNECTED_WAIT_MS] - Longest wait for the frame
 * @returns {{begin: function(): void, settle: function(): void, cancel: function(): void, isWaiting: function(): boolean}}
 *   `begin` on socket open, `settle` when `__connected__` arrives (a no-op when not waiting),
 *   `cancel` when the socket closes (the calls stay queued for the next socket)
 */
function createConnectedGate(onSettled, waitMs = CONNECTED_WAIT_MS) {
  let timer = null;
  let waiting = false;

  /** Stop waiting without sending. @returns {void} */
  function cancel() {
    waiting = false;
    clearTimeout(timer);
    timer = null;
  }

  /** Stop waiting and send the queued calls, once. @returns {void} */
  function settle() {
    if (!waiting) return;
    cancel();
    onSettled();
  }

  /** Start waiting for the frame (socket just opened). @returns {void} */
  function begin() {
    cancel();
    waiting = true;
    timer = setTimeout(settle, waitMs);
    // A wait must never keep a Node process alive.
    if (typeof timer.unref === "function") timer.unref();
  }

  return { begin, settle, cancel, isWaiting: () => waiting };
}

/**
 * A client's view of its server's clock: the offset from `__connected__` plus the gate that
 * holds queued calls until that frame has arrived.
 *
 * @param {function(): void} onSettled - Sends the queued calls (see `createConnectedGate`)
 * @param {number} [waitMs=CONNECTED_WAIT_MS] - Longest wait for the frame
 * @returns {{offset: function(): number, connected: function(Object): void, begin: function(): void, cancel: function(): void, isWaiting: function(): boolean}}
 *   `offset()` is server clock minus this one (0 until a greeting with `serverTime` arrives);
 *   `connected(data)` takes the `__connected__` data, stores the offset and sends the queued calls
 */
function createServerClock(onSettled, waitMs) {
  const gate = createConnectedGate(onSettled, waitMs);
  let offsetMs = 0;
  return {
    ...gate,
    offset: () => offsetMs,
    /**
     * Take the `__connected__` data: store the offset, send the queued calls.
     *
     * @param {Object} data - `{ clientId, sessionId, serverTime? }`
     * @returns {void}
     */
    connected(data) {
      offsetMs = clockOffsetFrom(data);
      gate.settle();
    },
  };
}

module.exports = { clockOffsetFrom, createConnectedGate, createServerClock, CONNECTED_WAIT_MS };
