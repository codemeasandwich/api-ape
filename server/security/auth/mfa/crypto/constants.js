/**
 * @file Crypto constants and error codes
 */
"use strict";

/**
 * Error codes for crypto operations
 * @enum {string}
 */
const CryptoError = {
  DECRYPTION_FAILED: "DECRYPTION_FAILED",
  INVALID_KEY_LENGTH: "INVALID_KEY_LENGTH",
  INVALID_CIPHERTEXT: "INVALID_CIPHERTEXT",
  INVALID_NONCE: "INVALID_NONCE",
  INVALID_TAG: "INVALID_TAG",
  ARGON2_NOT_AVAILABLE: "ARGON2_NOT_AVAILABLE",
  KDF_FAILED: "KDF_FAILED",
};

const AES_KEY_LENGTH = 32;
const GCM_NONCE_LENGTH = 12;
const GCM_TAG_LENGTH = 16;
const HKDF_HASH = "sha256";
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_HASH = "sha512";

module.exports = {
  CryptoError,
  AES_KEY_LENGTH,
  GCM_NONCE_LENGTH,
  GCM_TAG_LENGTH,
  HKDF_HASH,
  PBKDF2_ITERATIONS,
  PBKDF2_HASH,
};
