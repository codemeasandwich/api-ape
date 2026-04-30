/**
 * @fileoverview Build WebSocket URL with optional Phase 1 resume query (Node client).
 *
 * Domain context: Mirrors browser `resume=` hinting so server wiring can reattach logical ids.
 *
 * @module server/client/connection-ws-url
 */

/**
 * Append `resume=<clientId>` when reconnecting with a known logical id.
 *
 * @param {string|null} serverUrl - Target ws(s) URL or null
 * @param {string|null} apeLogicalClientId - Prior client id from `__connected__`
 * @returns {string|null}
 */
function buildWsConnectUrl(serverUrl, apeLogicalClientId) {
  if (!serverUrl) return serverUrl;
  try {
    const u = new URL(serverUrl);
    if (apeLogicalClientId) u.searchParams.set("resume", apeLogicalClientId);
    return u.toString();
  } catch {
    return serverUrl;
  }
}

module.exports = { buildWsConnectUrl };
