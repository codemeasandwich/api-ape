/**
 * @file Share record factory function
 */
"use strict";

/**
 * Create a share record object
 *
 * @param {string} shareId - Share identifier (S1, S2, S3)
 * @param {string} factor - Factor type (oauth, webauthn, totp)
 * @param {Buffer} encryptedData - Encrypted share data (null for S2)
 * @param {number} version - Share version
 * @returns {Object} Share record
 */
function createShareRecord(shareId, factor, encryptedData = null, version = 1) {
  return {
    shareId,
    factor,
    encryptedData: encryptedData
      ? encryptedData.toString("base64")
      : null,
    version,
    revoked: false,
    createdAt: Date.now(),
    revokedAt: null,
    revokedReason: null,
  };
}

module.exports = {
  createShareRecord,
};
