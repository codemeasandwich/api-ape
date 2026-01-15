/**
 * @file Two-of-three helper functions
 */
"use strict";

const crypto = require("crypto");
const { timingSafeEqual } = require("../crypto-utils");

/**
 * Generate challenge nonce
 * @returns {string} Base64url challenge
 */
function generateChallenge() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Compute proof hash for K_user verification
 * @param {Buffer} kUser - The user's key
 * @returns {Buffer} SHA-256 hash of K_user
 */
function computeProofHash(kUser) {
  return crypto.createHash("sha256").update(kUser).digest();
}

/**
 * Verify proof of K_user possession
 * @param {Buffer} kUser - Claimed K_user
 * @param {Buffer} storedProofHash - Stored proof hash
 * @returns {boolean} True if proof is valid
 */
function verifyProof(kUser, storedProofHash) {
  const computedHash = computeProofHash(kUser);
  return timingSafeEqual(computedHash, storedProofHash);
}

/**
 * Get enrollment key for pending operations
 * @param {string} clientId - Client identifier
 * @param {string} userId - User identifier
 * @returns {string} Combined key
 */
function getEnrollmentKey(clientId, userId) {
  return `${clientId}:${userId}`;
}

/**
 * Create a pending operation cleanup function
 * @param {Map} pendingEnrollments - Pending enrollments map
 * @param {Map} pendingRecoveries - Pending recoveries map
 * @returns {Function} Cleanup function
 */
function createCleanupExpired(pendingEnrollments, pendingRecoveries) {
  return function cleanupExpired() {
    const now = Date.now();
    for (const [key, pending] of pendingEnrollments) {
      if (pending.expiresAt < now) pendingEnrollments.delete(key);
    }
    for (const [key, pending] of pendingRecoveries) {
      if (pending.expiresAt < now) pendingRecoveries.delete(key);
    }
  };
}

module.exports = {
  generateChallenge,
  computeProofHash,
  verifyProof,
  getEnrollmentKey,
  createCleanupExpired,
};
