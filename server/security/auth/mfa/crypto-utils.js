/**
 * @fileoverview Cryptographic Utilities for Key Recovery
 *
 * Provides AEAD encryption, key derivation (HKDF), and password-based
 * key derivation (Argon2id with PBKDF2 fallback).
 *
 * @module server/security/auth/mfa/crypto-utils
 */

"use strict";

const {
  CryptoError,
  AES_KEY_LENGTH,
  GCM_NONCE_LENGTH,
  GCM_TAG_LENGTH,
  HKDF_HASH,
  PBKDF2_ITERATIONS,
  PBKDF2_HASH,
} = require("./crypto/constants");

const {
  aeadEncrypt,
  aeadDecrypt,
  packEncrypted,
  unpackEncrypted,
  encryptAndPack,
  unpackAndDecrypt,
} = require("./crypto/aead");

const {
  hkdf,
  argon2id,
  pbkdf2Fallback,
  isArgon2Available,
  deriveKeyForPurpose,
} = require("./crypto/kdf");

const {
  generateSalt,
  generateKey,
  timingSafeEqual,
  sha256,
  hmacSha256,
} = require("./crypto/utils");

module.exports = {
  // Error codes
  CryptoError,

  // Constants
  AES_KEY_LENGTH,
  GCM_NONCE_LENGTH,
  GCM_TAG_LENGTH,
  HKDF_HASH,
  PBKDF2_ITERATIONS,
  PBKDF2_HASH,

  // AEAD encryption
  aeadEncrypt,
  aeadDecrypt,
  packEncrypted,
  unpackEncrypted,
  encryptAndPack,
  unpackAndDecrypt,

  // Key derivation
  hkdf,
  argon2id,
  pbkdf2Fallback,
  isArgon2Available,
  deriveKeyForPurpose,

  // Utilities
  generateSalt,
  generateKey,
  timingSafeEqual,
  sha256,
  hmacSha256,
};
