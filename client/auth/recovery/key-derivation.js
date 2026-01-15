/**
 * @file Factor-specific key derivation functions
 */
'use strict';

const cryptoUtils = require('../crypto-utils');

/**
 * Derive S1 encryption key from OAuth token
 * @param {string} oauthToken - OAuth access token
 * @param {string} userId - User identifier
 * @returns {Promise<Uint8Array>}
 */
async function deriveS1Key(oauthToken, userId) {
  return cryptoUtils.hkdf(
    cryptoUtils.stringToUint8Array(oauthToken),
    cryptoUtils.stringToUint8Array(`api-ape:s1:${userId}`),
    cryptoUtils.stringToUint8Array('S1_key'),
    32
  );
}

/**
 * Derive S2 encryption key from WebAuthn data
 * @param {Uint8Array} authenticatorData - WebAuthn data
 * @param {string} credentialId - Credential ID
 * @returns {Promise<Uint8Array>}
 */
async function deriveS2Key(authenticatorData, credentialId) {
  return cryptoUtils.hkdf(
    authenticatorData,
    cryptoUtils.stringToUint8Array(credentialId),
    cryptoUtils.stringToUint8Array('S2_key'),
    32
  );
}

/**
 * Derive S3 encryption key from TOTP seed
 * @param {string} totpSeed - TOTP seed
 * @param {Uint8Array} salt - Salt value
 * @returns {Promise<Uint8Array>}
 */
async function deriveS3Key(totpSeed, salt) {
  return cryptoUtils.argon2id(
    cryptoUtils.stringToUint8Array(totpSeed),
    salt,
    {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      hashLength: 32
    }
  );
}

module.exports = {
  deriveS1Key,
  deriveS2Key,
  deriveS3Key,
};
