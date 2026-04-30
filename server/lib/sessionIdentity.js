/**
 * @fileoverview Session scope extraction for WebSocket and HTTP transports
 *
 * Domain context: Phase 1 binds resume hints (`clientId` in URL/header) to a
 * parent `sessionId` so a captured URL alone cannot reattach. The session may
 * come from an app-set `sessionId` cookie, from `x-ape-session-id` on Node, or
 * is minted per connection when absent and echoed in `__connected__` so clients
 * can persist it (browser cookie write; Node header on subsequent connects).
 *
 * Technical context: Cookie regex mirrors `server/lib/wiring.js` historical
 * behavior; header fallback avoids forcing Node clients to synthesize `Cookie`.
 *
 * @module server/lib/sessionIdentity
 */

const makeid = require("../utils/genId");

/**
 * Read session id from cookie or Node handshake header.
 *
 * @param {import('http').IncomingMessage} req - Upgrade or HTTP request
 * @returns {string|null} Parsed session id or null
 */
function parseSessionIdFromReq(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)sessionId=([^;]*)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  const hid = req.headers["x-ape-session-id"];
  if (hid && typeof hid === "string") return hid.trim();
  return null;
}

/**
 * Resolve non-null session scope — reuse inbound identity or mint once per request.
 *
 * @param {import('http').IncomingMessage} req - Upgrade or HTTP request
 * @returns {string} Session id for pairing and `__connected__`
 */
function effectiveSessionIdForRequest(req) {
  return parseSessionIdFromReq(req) || makeid(24);
}

module.exports = {
  parseSessionIdFromReq,
  effectiveSessionIdForRequest,
};
