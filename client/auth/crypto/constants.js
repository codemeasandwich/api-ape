/**
 * @file Cryptographic constants and error codes
 */
'use strict';

/**
 * Error codes for crypto operations
 * @enum {string}
 */
const CryptoError = {
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  INVALID_KEY_LENGTH: 'INVALID_KEY_LENGTH',
  INVALID_CIPHERTEXT: 'INVALID_CIPHERTEXT',
  INVALID_NONCE: 'INVALID_NONCE',
  INVALID_TAG: 'INVALID_TAG',
  ARGON2_NOT_AVAILABLE: 'ARGON2_NOT_AVAILABLE',
  KDF_FAILED: 'KDF_FAILED',
  CRYPTO_NOT_AVAILABLE: 'CRYPTO_NOT_AVAILABLE',
};

const AES_KEY_LENGTH = 32; // 256 bits for AES-256-GCM
const GCM_NONCE_LENGTH = 12; // 96 bits for GCM
const GCM_TAG_LENGTH = 16; // 128 bits auth tag
const PBKDF2_ITERATIONS = 600000; // OWASP recommended minimum

module.exports = {
  CryptoError,
  AES_KEY_LENGTH,
  GCM_NONCE_LENGTH,
  GCM_TAG_LENGTH,
  PBKDF2_ITERATIONS,
};
