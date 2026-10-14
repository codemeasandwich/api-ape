/**
 * @fileoverview Validated pass-through of Bun's `websocket` tuning options.
 *
 * ## Keepalive under Bun (what api-ape does and does not do)
 *
 * - api-ape never sends WebSocket ping frames itself. Under Node the `ws`
 *   adapter answers client pings; under Bun the runtime owns liveness: it sends
 *   protocol pings (`sendPings`, default true) and closes a connection that has
 *   been silent for `idleTimeout` seconds (default 120). Browsers answer pings
 *   automatically, so an idle browser tab stays connected.
 * - `GET /{prefix}/ape/ping` is an HTTP reachability probe (the client uses it
 *   to detect captive portals), not a WebSocket heartbeat.
 * - `this.keepalive()` inside a controller resets the CLIENT's per-call timer
 *   (10 s) for a slow call by sending `{ queryId, _keepalive: true }`. It does
 *   not extend the server's 10 s freshness window on the incoming call, which
 *   is checked once, when the call arrives.
 *
 * @module server/lib/runtimes/bunWebSocketConfig
 */

/** The Bun.serve `websocket` options api-ape forwards (everything but handlers). */
const ALLOWED_KEYS = [
  "idleTimeout",
  "sendPings",
  "maxPayloadLength",
  "backpressureLimit",
  "closeOnBackpressureLimit",
  "perMessageDeflate",
  "publishToSelf",
];

/**
 * Pick the allowed Bun websocket options from `options`.
 *
 * @param {Object} [options] - Caller's `websocketOptions`
 * @returns {Object} A new object holding only documented Bun options
 * @throws {Error} When `options` holds a key that is not a forwarded option
 */
function bunWebSocketConfig(options = {}) {
  const config = {};
  for (const key of Object.keys(options)) {
    if (!ALLOWED_KEYS.includes(key)) {
      throw new Error(
        `api-ape: unknown websocketOptions.${key}. Allowed: ${ALLOWED_KEYS.join(", ")}`,
      );
    }
    config[key] = options[key];
  }
  return config;
}

module.exports = { bunWebSocketConfig, ALLOWED_KEYS };
