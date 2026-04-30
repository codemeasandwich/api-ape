/**
 * @fileoverview Pending WebSocket resume slots after disconnect (Phase 1)
 *
 * Domain context: Browsers reconnect with `wss://…?resume=<priorClientId>` while
 * carrying `sessionId` in cookies (or `x-ape-session-id` for Node). After the
 * TCP socket closes we remove the live row from `ape.clients`, but we retain a
 * short-lived pairing `(sessionId, clientId)` so a genuine reconnect can reclaim
 * the same logical id within TTL. Expired slots drop silently — the next connect
 * mints a fresh id.
 *
 * Technical context: In-memory `Map` keyed by `clientId` with `clearTimeout`
 * timers. Claim is synchronous and atomic (delete-on-success) so two racing
 * upgrades cannot consume the same resume hint.
 *
 * @module server/lib/wiring/resumeRegistry
 */

/** Default grace period when env unset (ms). */
const DEFAULT_RESUME_TTL_MS = 120000;

/**
 * Effective TTL — read when registering so tests can tune without reload.
 *
 * @returns {number}
 * @private
 */
function resumeTtlMs() {
  const parsed = parseInt(process.env.APE_RESUME_TTL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RESUME_TTL_MS;
}

/** @type {Map<string, { sessionId: string, timer: NodeJS.Timeout }>} */
const pendingResume = new Map();

/**
 * Register a disconnected client id for possible resume.
 *
 * @param {string} clientId - Server-issued id from the closing socket
 * @param {string} sessionId - Parent session scope (never null in practice)
 * @returns {void}
 */
function registerPendingResume(clientId, sessionId) {
  clearPendingSlot(clientId);
  const timer = setTimeout(() => {
    pendingResume.delete(clientId);
  }, resumeTtlMs());
  if (typeof timer.unref === "function") timer.unref();
  pendingResume.set(clientId, { sessionId: String(sessionId), timer });
}

/**
 * Cancel any pending resume timer for this client id (supersede / reconnect win).
 *
 * @param {string} clientId - Client id
 * @returns {void}
 */
function cancelPendingResume(clientId) {
  clearPendingSlot(clientId);
}

/**
 * Consume a pending resume if `(sessionId, clientId)` matches the registration.
 *
 * @param {string} clientId - Resume hint from upgrade URL / header
 * @param {string} sessionId - Effective session from cookie / header / mint
 * @returns {boolean} True if claimed
 */
function claimPendingResume(clientId, sessionId) {
  const entry = pendingResume.get(clientId);
  if (!entry) return false;
  if (entry.sessionId !== String(sessionId)) return false;
  clearTimeout(entry.timer);
  pendingResume.delete(clientId);
  return true;
}

/**
 * Clear timer + map entry for one client id.
 *
 * @param {string} clientId - Client id
 * @private
 */
function clearPendingSlot(clientId) {
  const prev = pendingResume.get(clientId);
  if (!prev) return;
  clearTimeout(prev.timer);
  pendingResume.delete(clientId);
}

/**
 * Test hook — clears timers so pending state does not leak across Jest cases.
 *
 * @returns {void}
 */
function resetResumeRegistryForTesting() {
  for (const [, v] of pendingResume) {
    clearTimeout(v.timer);
  }
  pendingResume.clear();
}

module.exports = {
  registerPendingResume,
  cancelPendingResume,
  claimPendingResume,
  resumeTtlMs,
  resetResumeRegistryForTesting,
};
