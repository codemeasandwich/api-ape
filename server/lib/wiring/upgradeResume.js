/**
 * @fileoverview WebSocket resume resolution at upgrade time (Phase 1)
 *
 * Domain context: Determines whether the inbound upgrade mints a fresh `clientId`
 * or reattaches to a prior logical client (`resume` query / handshake header)
 * validated against `sessionId`. Supersedes an older live socket for the same id
 * when the session matches (split-brain avoidance).
 *
 * Technical context: Reads `_raw` from the internal clients map; destroys the
 * prior socket with `__apeSkipResumePending` so its `close` handler does not
 * register spurious pending rows or delete another socket's registry entry.
 *
 * @module server/lib/wiring/upgradeResume
 */

const makeid = require("../../utils/genId");
const { effectiveSessionIdForRequest } = require("../sessionIdentity");
const {
  cancelPendingResume,
  claimPendingResume,
} = require("./resumeRegistry");

/**
 * Extract resume hint from upgrade URL (`?resume=`) or Node handshake headers.
 *
 * @param {import('http').IncomingMessage} req - Upgrade request
 * @returns {string|null} Resume token or null
 */
function parseResumeHint(req) {
  try {
    const u = new URL(req.url || "/", "http://ape.invalid");
    const q = u.searchParams.get("resume");
    if (q) return sanitizeResumeHint(decodeURIComponent(q));
  } catch {
    /* ignore malformed URL */
  }
  const h = req.headers;
  const head =
    (typeof h["x-ape-resume"] === "string" && h["x-ape-resume"]) ||
    (typeof h.resume === "string" && h.resume);
  return head ? sanitizeResumeHint(head.trim()) : null;
}

/**
 * Allow only plausible api-ape ids (Crockford base32 subset).
 *
 * @param {string} raw - Raw hint
 * @returns {string|null} Sanitized or null
 * @private
 */
function sanitizeResumeHint(raw) {
  if (!raw || raw.length > 64) return null;
  if (!/^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]+$/.test(raw)) return null;
  return raw;
}

/**
 * Compare stored row session id with the effective session for this upgrade.
 *
 * Domain context: Rows may carry `this.sessionId` from the outer framework and
 * it may be absent or null (`server/README.md` — Session ID from cookie); the
 * inbound upgrade always resolves a non-empty `effectiveSessionId` via
 * `effectiveSessionIdForRequest` (reuse cookie/header identity or mint once).
 *
 * Technical context: Only the left-hand value is nullish-coerced so pairing
 * stays stable without implying `effectiveSessionId` can be missing—matching
 * `sessionIdentity` guarantees.
 *
 * @param {string|null|undefined} rawSessionId - Typically `wrapper._raw.sessionId`
 * @param {string} effectiveSessionId - Always defined from `effectiveSessionIdForRequest(req)`
 * @returns {boolean} True when equal after normalizing the stored side only
 * @private
 */
function sessionIdsEqual(rawSessionId, effectiveSessionId) {
  return String(rawSessionId ?? "") === String(effectiveSessionId);
}

/**
 * Force-close a stale socket before replacing its logical client row.
 *
 * @param {{ socket?: import('ws').WebSocket }} raw - Broadcast raw row
 * @private
 */
function evictSupersededSocket(raw) {
  const s = raw && raw.socket;
  if (!s) return;
  try {
    s.__apeSkipResumePending = true;
    if (typeof s.close === "function") s.close(4000, "Superseded");
    if (typeof s.terminate === "function") s.terminate();
    if (typeof s.destroy === "function") s.destroy();
  } catch {
    /* ignore double-close */
  }
}

/**
 * Resolve `clientId` and effective session for this upgrade.
 *
 * @param {import('http').IncomingMessage} req - Upgrade request
 * @param {Object} deps - Wiring dependencies
 * @param {Map<string, Object>} deps._clients - Internal clients map
 * @param {Function} deps.removeClient - Broadcast removeClient
 * @returns {{ clientId: string, effectiveSessionId: string }}
 */
function resolveWsClientId(req, { _clients, removeClient }) {
  const effectiveSessionId = effectiveSessionIdForRequest(req);
  const resumeHint = parseResumeHint(req);

  if (resumeHint) {
    if (_clients.has(resumeHint)) {
      const wrapper = _clients.get(resumeHint);
      const raw = wrapper._raw;
      if (sessionIdsEqual(raw.sessionId, effectiveSessionId)) {
        cancelPendingResume(resumeHint);
        evictSupersededSocket(raw);
        removeClient(resumeHint);
        return { clientId: resumeHint, effectiveSessionId };
      }
      return { clientId: makeid(20), effectiveSessionId };
    }
    if (claimPendingResume(resumeHint, effectiveSessionId)) {
      return { clientId: resumeHint, effectiveSessionId };
    }
  }

  return { clientId: makeid(20), effectiveSessionId };
}

module.exports = {
  parseResumeHint,
  resolveWsClientId,
};
