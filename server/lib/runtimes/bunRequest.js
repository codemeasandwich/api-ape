/**
 * @fileoverview Bun request adapter: Node-shaped requests and the pre-upgrade
 * Origin check for api-ape's Bun entry points.
 *
 * ## Why this exists
 *
 * Bun hands `fetch(req, server)` a Fetch `Request`. The rest of api-ape (the
 * Origin check, session cookie / `x-ape-session-id` parsing, resume hints, the
 * user-agent parse and controller `this.req`) was written for Node's
 * `http.IncomingMessage` and reads `req.headers.cookie`,
 * `req.headers["user-agent"]`, `req.headers.origin` and
 * `req.socket.remoteAddress`. On a Fetch `Request` those are all `undefined`,
 * so under Bun (before 4.3.0):
 *
 * - the Origin check never saw `Origin` or `Host` and always passed,
 * - every connect minted a fresh session id, so `resume` never matched,
 * - `this.agent` was empty.
 *
 * ## What it does
 *
 * - {@link toNodeRequest} builds a Node-shaped request (`headers` plain object
 *   keyed by lower-case name, `url` = path + query, `method`, `socket`), and
 *   keeps two Fetch accessors (`headers.get/has`) and `rawRequest` (the original
 *   `Request`). Other `Headers` methods (`entries`, `forEach`, `getSetCookie`)
 *   are not provided: read them from `rawRequest.headers`.
 * - {@link upgradeWebSocket} runs the Origin policy BEFORE `server.upgrade()`, so
 *   a refused page gets an HTTP 403 and never reaches `onConnect` or a
 *   controller. The policy defaults to `exact` (host AND port) here; see
 *   {@link module:server/security/origin}.
 *
 * Both Bun entry points (`api-ape/bun` and `ape(server)` on a Bun server) call
 * this module, so they cannot drift.
 *
 * @module server/lib/runtimes/bunRequest
 */

const originSecurity = require("../../security/origin");
const { resolveOriginPolicy } = originSecurity;
const { apeLog } = require("../../../utils/apeLogger");

/**
 * Convert a Fetch `Request` into the shape the Node code paths expect.
 *
 * @param {Request} req - Bun Fetch request
 * @param {Object} [server] - Bun server (used for `requestIP`)
 * @returns {{headers: Object, url: string, method: string, socket: Object, rawRequest: Request}}
 *     Node-shaped request. `headers` is a plain object with lower-case keys plus
 *     non-enumerable `get(name)` and `has(name)` Fetch-style accessors.
 */
function toNodeRequest(req, server) {
  const headers = {};
  req.headers.forEach((value, name) => {
    // defineProperty so a header literally named "__proto__" is plain data
    Object.defineProperty(headers, name.toLowerCase(), {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  });
  Object.defineProperties(headers, {
    get: { value: (name) => req.headers.get(name), enumerable: false },
    has: { value: (name) => req.headers.has(name), enumerable: false },
  });

  const parsed = new URL(req.url);
  const socket = {};
  const ip = server && typeof server.requestIP === "function" ? server.requestIP(req) : null;
  if (ip) {
    socket.remoteAddress = ip.address;
    socket.remotePort = ip.port;
  }

  return {
    headers,
    url: parsed.pathname + parsed.search,
    method: req.method,
    socket,
    rawRequest: req,
  };
}

/**
 * Handle a request to the WebSocket path: check Origin, then upgrade.
 *
 * @param {Request} req - Bun Fetch request for the api-ape WebSocket path
 * @param {Object} server - Bun server with `upgrade()`
 * @param {Object} [options]
 * @param {Object} [options.originPolicy] - `{ mode, allowedOrigins, allowedHosts }`;
 *     `mode` defaults to `"exact"` under Bun
 * @param {Function} [options.onError] - Called with the refusal message
 * @returns {Response|undefined|null} `null` when `req` is not a WebSocket upgrade
 *     (caller should fall through), `undefined` when Bun took over the
 *     connection, otherwise a `Response` (403 refused origin, 500 failed upgrade)
 */
function upgradeWebSocket(req, server, options = {}) {
  const upgrade = req.headers.get("upgrade");
  if (!upgrade || upgrade.toLowerCase() !== "websocket") return null;

  const nodeReq = toNodeRequest(req, server);
  const policy = resolveOriginPolicy(options.originPolicy, "exact");
  const onError = options.onError || ((message) => apeLog.error(message));

  if (!originSecurity(null, nodeReq, onError, policy)) {
    return new Response("Origin not allowed", { status: 403 });
  }

  if (server.upgrade(req, { data: { req: nodeReq } })) {
    // undefined tells Bun the upgrade owns the response
    return undefined;
  }
  return new Response("WebSocket upgrade failed", { status: 500 });
}

module.exports = { toNodeRequest, upgradeWebSocket };
