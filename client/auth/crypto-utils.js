/**
 * @file Browser Cryptographic Utilities for Key Recovery
 *
 * Provides AEAD encryption, key derivation (HKDF), and password-based
 * key derivation (Argon2id) using Web Crypto API and argon2-browser.
 *
 * API compatible with server/security/auth/mfa/crypto-utils.js
 *
 * @module client/auth/crypto-utils
 */
'use strict';

const {
  CryptoError,
  AES_KEY_LENGTH,
  GCM_NONCE_LENGTH,
  GCM_TAG_LENGTH,
  PBKDF2_ITERATIONS,
} = require('./crypto/constants');

const {
  isCryptoAvailable,
  stringToUint8Array,
  uint8ArrayToString,
  uint8ArrayToBase64,
  base64ToUint8Array,
  randomBytes,
  timingSafeEqual,
} = require('./crypto/encoding');

const {
  aeadEncrypt,
  aeadDecrypt,
  packEncrypted,
  unpackEncrypted,
  encryptAndPack,
  unpackAndDecrypt,
} = require('./crypto/aead');

const {
  hkdf,
  argon2id,
  pbkdf2Fallback,
  isArgon2Available,
} = require('./crypto/kdf');

/**
 * Generate a random salt for KDF
 * @param {number} [length] - Salt length in bytes
 * @returns {Uint8Array}
 */
function generateSalt(length = 16) {
  return randomBytes(length);
}

/**
 * Generate a random encryption key
 * @param {number} [length] - Key length in bytes
 * @returns {Uint8Array}
 */
function generateKey(length = AES_KEY_LENGTH) {
  return randomBytes(length);
}

/**
 * Derive a key from a master key for a specific purpose
 * @param {Uint8Array} masterKey - Master key material
 * @param {string} purpose - Key purpose identifier
 * @param {number} [version] - Key version
 * @returns {Promise<Uint8Array>}
 */
async function deriveKeyForPurpose(masterKey, purpose, version = 1) {
  const info = `api-ape:key-recovery:${purpose}:v${version}`;
  return hkdf(masterKey, '', info, AES_KEY_LENGTH);
}

module.exports = {
  // AEAD
  aeadEncrypt,
  aeadDecrypt,

  // Packing
  packEncrypted,
  unpackEncrypted,
  encryptAndPack,
  unpackAndDecrypt,

  // KDF
  hkdf,
  argon2id,
  pbkdf2Fallback,
  isArgon2Available,

  // Utilities
  generateSalt,
  generateKey,
  randomBytes,
  timingSafeEqual,
  deriveKeyForPurpose,

  // Encoding utilities
  stringToUint8Array,
  uint8ArrayToString,
  uint8ArrayToBase64,
  base64ToUint8Array,

  // Constants
  AES_KEY_LENGTH,
  GCM_NONCE_LENGTH,
  GCM_TAG_LENGTH,
  PBKDF2_ITERATIONS,

  // Errors
  CryptoError,

  // Environment checks
  isCryptoAvailable,
};
