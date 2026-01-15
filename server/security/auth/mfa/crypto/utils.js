/**
 * @file Utility functions for crypto operations
 */
"use strict";

const crypto = require("crypto");

/**
 * Generate random salt
 *
 * @param {number} length - Salt length in bytes
 * @returns {Buffer} Random salt
 */
function generateSalt(length = 16) {
  return crypto.randomBytes(length);
}

/**
 * Generate random key
 *
 * @param {number} length - Key length in bytes
 * @returns {Buffer} Random key
 */
function generateKey(length = 32) {
  return crypto.randomBytes(length);
}

/**
 * Constant-time comparison
 *
 * @param {Buffer} a - First buffer
 * @param {Buffer} b - Second buffer
 * @returns {boolean} True if equal
 */
function timingSafeEqual(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * SHA-256 hash
 *
 * @param {Buffer|string} data - Data to hash
 * @returns {Buffer} Hash
 */
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest();
}

/**
 * HMAC-SHA256
 *
 * @param {Buffer} key - Key
 * @param {Buffer|string} data - Data
 * @returns {Buffer} HMAC
 */
function hmacSha256(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

module.exports = {
  generateSalt,
  generateKey,
  timingSafeEqual,
  sha256,
  hmacSha256,
};
