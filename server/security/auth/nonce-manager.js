/**
 * @fileoverview Nonce Manager for api-ape Authentication
 *
 * Handles single-use server nonce generation, validation, and consumption.
 *
 * @module server/security/auth/nonce-manager
 * @see {@link module:server/security/auth/state-machine} for the main state machine
 */

const crypto = require("crypto");

/**
 * Create nonce management functions
 *
 * @param {Object} deps - Dependencies
 * @param {number} deps.nonceExpiry - Nonce expiry time in ms
 * @param {Object} deps.AuthError - Error code enum
 * @returns {Object} Nonce management functions
 */
function createNonceManager(deps) {
  const { nonceExpiry, AuthError } = deps;

  const usedNonces = new Set();
  const pendingNonces = new Map();

  /**
   * Generate a single-use server nonce
   * @param {number} [length=32] - Nonce length in bytes
   * @returns {Object} Nonce info { nonce, expiresAt }
   */
  function generateNonce(length = 32) {
    const nonce = crypto.randomBytes(length).toString("base64url");
    const expiresAt = Date.now() + nonceExpiry;
    pendingNonces.set(nonce, { expiresAt, used: false });
    setTimeout(() => {
      pendingNonces.delete(nonce);
    }, nonceExpiry + 1000);
    return { nonce, expiresAt };
  }

  /**
   * Validate and consume a nonce
   * @param {string} nonce - The nonce to validate
   * @returns {boolean} True if valid
   * @throws {Error} If nonce is expired, reused, or invalid
   */
  function consumeNonce(nonce) {
    if (usedNonces.has(nonce)) {
      const err = new Error("Nonce already used");
      err.code = AuthError.NONCE_REUSED;
      throw err;
    }
    const nonceInfo = pendingNonces.get(nonce);
    if (!nonceInfo) {
      const err = new Error("Invalid or expired nonce");
      err.code = AuthError.NONCE_EXPIRED;
      throw err;
    }
    if (Date.now() > nonceInfo.expiresAt) {
      pendingNonces.delete(nonce);
      const err = new Error("Nonce expired");
      err.code = AuthError.NONCE_EXPIRED;
      throw err;
    }
    pendingNonces.delete(nonce);
    usedNonces.add(nonce);
    setTimeout(() => {
      usedNonces.delete(nonce);
    }, nonceExpiry * 2);
    return true;
  }

  /**
   * Clear all pending nonces
   */
  function clearPendingNonces() {
    pendingNonces.clear();
  }

  return {
    generateNonce,
    consumeNonce,
    clearPendingNonces,
  };
}

module.exports = {
  createNonceManager,
};
