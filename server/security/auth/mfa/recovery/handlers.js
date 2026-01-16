/**
 * @fileoverview Recovery Handler Functions
 * @module server/security/auth/mfa/recovery/handlers
 */

"use strict";

const crypto = require("crypto");
const { ShareId } = require("../ledger");
const { RecoveryMessageType, RecoveryError, RECOVERY_REQUIREMENTS } = require("./constants");

/**
 * Generate recovery challenge
 * @returns {string} Base64url challenge
 */
function generateChallenge() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Get recovery key
 * @param {string} clientId - Client identifier
 * @param {string} userId - User identifier
 * @returns {string} Combined key
 */
function getRecoveryKey(clientId, userId) {
  return `${clientId}:${userId}`;
}

/**
 * Clean up expired recoveries
 * @param {Map} pendingRecoveries - Pending recoveries map
 * @returns {void}
 */
function cleanupExpired(pendingRecoveries) {
  const now = Date.now();
  for (const [key, pending] of pendingRecoveries) {
    if (pending.expiresAt < now) {
      pendingRecoveries.delete(key);
    }
  }
}

/**
 * Create lost device start handler
 * @param {Object} deps - Dependencies
 * @param {Object} deps.twoOfThreeAdapter - Two-of-three adapter
 * @param {Map} deps.pendingRecoveries - Pending recoveries map
 * @param {number} deps.recoveryTimeout - Recovery timeout in ms
 * @returns {Function} Handler function
 */
function createLostDeviceStartHandler(deps) {
  const { twoOfThreeAdapter, pendingRecoveries, recoveryTimeout } = deps;

  return async function handleLostDeviceStart({ clientId, userId, lostFactor }) {
    cleanupExpired(pendingRecoveries);

    if (!Object.values(ShareId).includes(lostFactor)) {
      const err = new Error(`Invalid lost factor: ${lostFactor}`);
      err.code = RecoveryError.INVALID_LOST_FACTOR;
      throw err;
    }

    if (!(await twoOfThreeAdapter.isEnrolled(userId))) {
      const err = new Error(`User ${userId} is not enrolled`);
      err.code = RecoveryError.NOT_ENROLLED;
      throw err;
    }

    const key = getRecoveryKey(clientId, userId);
    if (pendingRecoveries.has(key)) {
      const err = new Error("Recovery already in progress");
      err.code = RecoveryError.RECOVERY_IN_PROGRESS;
      throw err;
    }

    const requirements = RECOVERY_REQUIREMENTS[lostFactor];
    const challenge = generateChallenge();

    pendingRecoveries.set(key, {
      lostFactor,
      challenge,
      verifiedFactors: new Set(),
      requirements,
      expiresAt: Date.now() + recoveryTimeout,
    });

    setTimeout(() => { pendingRecoveries.delete(key); }, recoveryTimeout + 1000);

    return {
      type: RecoveryMessageType.LOST_DEVICE_CHALLENGE,
      lostFactor,
      challenge,
      requiredFactors: requirements.requiredFactors,
      description: requirements.description,
    };
  };
}

/**
 * Create verify factor handler
 * @param {Object} deps - Dependencies
 * @param {Map} deps.pendingRecoveries - Pending recoveries map
 * @param {Function} deps.verifyOAuth - OAuth verification function
 * @param {Function} deps.verifyWebAuthn - WebAuthn verification function
 * @param {Function} deps.verifyTOTP - TOTP verification function
 * @returns {Function} Handler function
 */
function createVerifyFactorHandler(deps) {
  const { pendingRecoveries, verifyOAuth, verifyWebAuthn, verifyTOTP } = deps;

  return async function handleVerifyFactor({ clientId, userId, factor, verification }) {
    cleanupExpired(pendingRecoveries);

    const key = getRecoveryKey(clientId, userId);
    const pending = pendingRecoveries.get(key);

    if (!pending) {
      const err = new Error("No pending recovery found");
      err.code = RecoveryError.NO_PENDING_RECOVERY;
      throw err;
    }

    if (!pending.requirements.requiredFactors.includes(factor)) {
      const err = new Error(`Factor ${factor} is not required for this recovery`);
      err.code = RecoveryError.INVALID_LOST_FACTOR;
      throw err;
    }

    let verified = false;
    if (factor === ShareId.S1 && verifyOAuth) {
      verified = await verifyOAuth(userId, verification.token || verification);
    } else if (factor === ShareId.S2 && verifyWebAuthn) {
      verified = await verifyWebAuthn(userId, verification.assertion || verification);
    } else if (factor === ShareId.S3 && verifyTOTP) {
      verified = await verifyTOTP(userId, verification.code || verification);
    } else {
      verified = true;
    }

    if (!verified) {
      const err = new Error(`${factor} verification failed`);
      err.code = RecoveryError.FACTOR_VERIFICATION_FAILED;
      throw err;
    }

    pending.verifiedFactors.add(factor);
    const allVerified = pending.requirements.requiredFactors.every((f) => pending.verifiedFactors.has(f));

    return {
      type: RecoveryMessageType.LOST_DEVICE_VERIFY,
      factor,
      verified: true,
      remainingFactors: pending.requirements.requiredFactors.filter((f) => !pending.verifiedFactors.has(f)),
      readyForRegeneration: allVerified,
    };
  };
}

/**
 * Create regenerate share handler
 * @param {Object} deps - Dependencies
 * @param {Object} deps.twoOfThreeAdapter - Two-of-three adapter
 * @param {Map} deps.pendingRecoveries - Pending recoveries map
 * @returns {Function} Handler function
 */
function createRegenerateShareHandler(deps) {
  const { twoOfThreeAdapter, pendingRecoveries } = deps;

  return async function handleRegenerateShare({ clientId, userId, newEncryptedShare }) {
    cleanupExpired(pendingRecoveries);

    const key = getRecoveryKey(clientId, userId);
    const pending = pendingRecoveries.get(key);

    if (!pending) {
      const err = new Error("No pending recovery found");
      err.code = RecoveryError.NO_PENDING_RECOVERY;
      throw err;
    }

    const allVerified = pending.requirements.requiredFactors.every((f) => pending.verifiedFactors.has(f));

    if (!allVerified) {
      const err = new Error("Not all required factors have been verified");
      err.code = RecoveryError.INSUFFICIENT_REMAINING_FACTORS;
      throw err;
    }

    const result = await twoOfThreeAdapter.handleRotation({
      clientId,
      userId,
      shareId: pending.lostFactor,
      encryptedShare: newEncryptedShare,
      reason: "device_recovery",
    });

    pendingRecoveries.delete(key);

    return {
      type: RecoveryMessageType.RECOVERY_OK,
      lostFactor: pending.lostFactor,
      newVersion: result.newVersion,
      message: `${pending.lostFactor} has been regenerated`,
    };
  };
}

module.exports = {
  generateChallenge,
  getRecoveryKey,
  cleanupExpired,
  createLostDeviceStartHandler,
  createVerifyFactorHandler,
  createRegenerateShareHandler,
};
