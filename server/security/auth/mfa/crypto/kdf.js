/**
 * @file Key derivation functions (HKDF, Argon2id, PBKDF2)
 */
"use strict";

const crypto = require("crypto");
const { CryptoError, HKDF_HASH, PBKDF2_ITERATIONS, PBKDF2_HASH } = require("./constants");

let argon2 = null;
try {
  argon2 = require("argon2");
} catch {
  argon2 = null;
}

/**
 * Check if Argon2 is available
 * @returns {boolean}
 */
function isArgon2Available() {
  return argon2 !== null;
}

/**
 * HKDF key derivation using SHA-256
 *
 * @param {Buffer} ikm - Input key material
 * @param {Buffer|string} salt - Salt
 * @param {Buffer|string} info - Context info
 * @param {number} length - Output length in bytes
 * @returns {Buffer} Derived key
 */
function hkdf(ikm, salt, info, length = 32) {
  const ikmBuf = Buffer.isBuffer(ikm) ? ikm : Buffer.from(ikm);
  const saltBuf = Buffer.isBuffer(salt) ? salt : Buffer.from(salt);
  const infoBuf = Buffer.isBuffer(info) ? info : Buffer.from(info);
  return Buffer.from(crypto.hkdfSync(HKDF_HASH, ikmBuf, saltBuf, infoBuf, length));
}

/**
 * PBKDF2 key derivation (fallback for Argon2id)
 *
 * @param {Buffer|string} password - Password
 * @param {Buffer} salt - Salt
 * @param {number} iterations - Number of iterations
 * @param {number} keyLength - Output key length
 * @returns {Buffer} Derived key
 */
function pbkdf2Fallback(password, salt, iterations = PBKDF2_ITERATIONS, keyLength = 32) {
  if (!Buffer.isBuffer(salt)) {
    throw new Error("Salt must be a Buffer");
  }
  const passwordBuf = Buffer.isBuffer(password) ? password : Buffer.from(password);
  return crypto.pbkdf2Sync(passwordBuf, salt, iterations, keyLength, PBKDF2_HASH);
}

/**
 * Argon2id key derivation with PBKDF2 fallback
 *
 * @param {Buffer|string} password - Password
 * @param {Buffer} salt - Salt
 * @param {Object} options - Options
 * @param {number} options.memoryCost - Memory cost (KB)
 * @param {number} options.timeCost - Time cost (iterations)
 * @param {number} options.parallelism - Parallelism
 * @param {number} options.hashLength - Output length
 * @returns {Promise<Buffer>} Derived key
 */
async function argon2id(password, salt, options = {}) {
  if (!Buffer.isBuffer(salt)) {
    throw new Error("Salt must be a Buffer");
  }
  if (salt.length < 16) {
    throw new Error("Salt must be at least 16 bytes");
  }

  const { memoryCost = 65536, timeCost = 3, parallelism = 4, hashLength = 32 } = options;

  if (!argon2) {
    return pbkdf2Fallback(password, salt, PBKDF2_ITERATIONS, hashLength);
  }

  try {
    const hash = await argon2.hash(password, {
      salt,
      type: argon2.argon2id,
      memoryCost,
      timeCost,
      parallelism,
      hashLength,
      raw: true,
    });
    return hash;
  } catch {
    return pbkdf2Fallback(password, salt, PBKDF2_ITERATIONS, hashLength);
  }
}

/**
 * Derive a purpose-specific key using HKDF
 *
 * @param {Buffer} masterKey - Master key material
 * @param {string} purpose - Key purpose identifier
 * @param {number} version - Key version for rotation support
 * @param {number} length - Output key length
 * @returns {Buffer} Derived key
 */
function deriveKeyForPurpose(masterKey, purpose, version = 1, length = 32) {
  const salt = Buffer.from("api-ape-key-derivation");
  const info = Buffer.from(`${purpose}:v${version}`);
  return hkdf(masterKey, salt, info, length);
}

module.exports = {
  hkdf,
  argon2id,
  pbkdf2Fallback,
  isArgon2Available,
  deriveKeyForPurpose,
};
