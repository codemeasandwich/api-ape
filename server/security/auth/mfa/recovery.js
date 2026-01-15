/**
 * @fileoverview Key Recovery Handler
 *
 * Handles device loss scenarios and share rotation flows.
 * Works with the two-of-three adapter to manage recovery processes
 * when a user loses access to one of their authentication factors.
 *
 * @module server/security/auth/mfa/recovery
 */

"use strict";

const { ShareId } = require("./ledger");
const { RecoveryMessageType, RecoveryError, RECOVERY_REQUIREMENTS } = require("./recovery/constants");
const {
  getRecoveryKey,
  cleanupExpired,
  createLostDeviceStartHandler,
  createVerifyFactorHandler,
  createRegenerateShareHandler,
} = require("./recovery/handlers");

/**
 * Create a recovery handler
 *
 * @param {Object} config - Recovery handler configuration
 * @param {Object} config.twoOfThreeAdapter - Two-of-three adapter instance
 * @param {Function} [config.verifyOAuth] - OAuth verification fn(userId, token) => boolean
 * @param {Function} [config.verifyWebAuthn] - WebAuthn verification fn(userId, assertion) => boolean
 * @param {Function} [config.verifyTOTP] - TOTP verification fn(userId, code) => boolean
 * @param {number} [config.recoveryTimeout=600000] - Recovery timeout (10 min)
 * @returns {Object} Recovery handler
 */
function createRecoveryHandler(config = {}) {
  const {
    twoOfThreeAdapter,
    verifyOAuth,
    verifyWebAuthn,
    verifyTOTP,
    recoveryTimeout = 600000,
  } = config;

  if (!twoOfThreeAdapter) {
    throw new Error("twoOfThreeAdapter is required");
  }

  const pendingRecoveries = new Map();

  const deps = { twoOfThreeAdapter, pendingRecoveries, recoveryTimeout, verifyOAuth, verifyWebAuthn, verifyTOTP };

  const handleLostDeviceStart = createLostDeviceStartHandler(deps);
  const handleVerifyFactor = createVerifyFactorHandler(deps);
  const handleRegenerateShare = createRegenerateShareHandler(deps);

  // ============================================================
  // Convenience Methods for Specific Scenarios
  // ============================================================

  /**
   * Handle lost WebAuthn device
   * Requires OAuth + TOTP verification, then re-enrollment of WebAuthn
   *
   * @param {Object} params
   * @param {string} params.clientId - Client identifier
   * @param {string} params.userId - User identifier
   * @returns {Promise<Object>} Recovery challenge
   */
  async function handleLostWebAuthn({ clientId, userId }) {
    return handleLostDeviceStart({
      clientId,
      userId,
      lostFactor: ShareId.S2,
    });
  }

  /**
   * Handle lost TOTP device
   * Requires OAuth + WebAuthn verification, then re-enrollment of TOTP
   *
   * @param {Object} params
   * @param {string} params.clientId - Client identifier
   * @param {string} params.userId - User identifier
   * @returns {Promise<Object>} Recovery challenge
   */
  async function handleLostTOTP({ clientId, userId }) {
    return handleLostDeviceStart({
      clientId,
      userId,
      lostFactor: ShareId.S3,
    });
  }

  /**
   * Handle OAuth account rotation
   * Requires WebAuthn + TOTP verification, then re-linking OAuth
   *
   * @param {Object} params
   * @param {string} params.clientId - Client identifier
   * @param {string} params.userId - User identifier
   * @returns {Promise<Object>} Recovery challenge
   */
  async function handleOAuthRotation({ clientId, userId }) {
    return handleLostDeviceStart({
      clientId,
      userId,
      lostFactor: ShareId.S1,
    });
  }

  /**
   * Get pending recovery status
   *
   * @param {string} clientId - Client identifier
   * @param {string} userId - User identifier
   * @returns {Object|null} Pending recovery status or null
   */
  function getPendingRecoveryStatus(clientId, userId) {
    cleanupExpired(pendingRecoveries);
    const key = getRecoveryKey(clientId, userId);
    const pending = pendingRecoveries.get(key);

    if (!pending) return null;

    return {
      lostFactor: pending.lostFactor,
      verifiedFactors: Array.from(pending.verifiedFactors),
      remainingFactors: pending.requirements.requiredFactors.filter(
        (f) => !pending.verifiedFactors.has(f)
      ),
      readyForRegeneration: pending.requirements.requiredFactors.every(
        (f) => pending.verifiedFactors.has(f)
      ),
      expiresAt: pending.expiresAt,
    };
  }

  /**
   * Cancel pending recovery
   *
   * @param {string} clientId - Client identifier
   * @param {string} userId - User identifier
   */
  function cancelRecovery(clientId, userId) {
    const key = getRecoveryKey(clientId, userId);
    pendingRecoveries.delete(key);
  }

  /**
   * Clean up client state
   *
   * @param {string} clientId - Client identifier
   */
  function cleanupClient(clientId) {
    for (const key of pendingRecoveries.keys()) {
      if (key.startsWith(`${clientId}:`)) {
        pendingRecoveries.delete(key);
      }
    }
  }

  return {
    // Core handlers
    handleLostDeviceStart,
    handleVerifyFactor,
    handleRegenerateShare,

    // Convenience methods
    handleLostWebAuthn,
    handleLostTOTP,
    handleOAuthRotation,

    // Status and management
    getPendingRecoveryStatus,
    cancelRecovery,
    cleanupClient,

    // Enums
    MessageType: RecoveryMessageType,
    Error: RecoveryError,

    // For testing
    _pendingRecoveries: pendingRecoveries,
  };
}

module.exports = {
  createRecoveryHandler,
  RecoveryMessageType,
  RecoveryError,
  RECOVERY_REQUIREMENTS,
};
