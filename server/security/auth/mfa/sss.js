/**
 * @fileoverview Shamir Secret Sharing (SSS) Utilities
 *
 * Implements threshold secret sharing using GF(256) arithmetic.
 *
 * @module server/security/auth/mfa/sss
 */

"use strict";

const crypto = require("crypto");
const { SSSError } = require("./sss/constants");
const { gfMul, gfDiv, gfAdd, evaluatePolynomial, lagrangeInterpolate } = require("./sss/gf256");
const { serializeShare, deserializeShare, verifyShareFormat } = require("./sss/serialization");

/**
 * Split a secret into n shares with threshold k
 *
 * @param {Buffer|Uint8Array|string} secret - Secret to split
 * @param {number} threshold - Minimum shares needed to reconstruct
 * @param {number} totalShares - Total shares to generate
 * @returns {Array} Array of shares with index and data
 * @throws {Error} If parameters are invalid
 */
function split(secret, threshold, totalShares) {
  if (threshold < 2) {
    const err = new Error(`Threshold must be at least 2, got ${threshold}`);
    err.code = SSSError.INVALID_THRESHOLD;
    throw err;
  }
  if (totalShares < threshold) {
    const err = new Error(`Total shares (${totalShares}) must be >= threshold (${threshold})`);
    err.code = SSSError.INVALID_SHARE_COUNT;
    throw err;
  }
  if (totalShares > 255) {
    const err = new Error(`Total shares (${totalShares}) must be <= 255 for GF(256)`);
    err.code = SSSError.INVALID_SHARE_COUNT;
    throw err;
  }

  let secretBuffer;
  if (typeof secret === "string") secretBuffer = Buffer.from(secret, "utf8");
  else if (secret instanceof Uint8Array) secretBuffer = Buffer.from(secret);
  else {
    const err = new Error("Secret must be a Buffer, Uint8Array, or string");
    err.code = SSSError.INVALID_SECRET;
    throw err;
  }

  if (secretBuffer.length === 0) {
    const err = new Error("Secret cannot be empty");
    err.code = SSSError.INVALID_SECRET;
    throw err;
  }

  const coeffCount = threshold - 1;
  const randomBytes = crypto.randomBytes(secretBuffer.length * coeffCount);

  const shares = [];
  for (let i = 0; i < totalShares; i++) {
    shares.push({ index: i + 1, data: Buffer.alloc(secretBuffer.length) });
  }

  for (let byteIdx = 0; byteIdx < secretBuffer.length; byteIdx++) {
    const coefficients = new Uint8Array(threshold);
    coefficients[0] = secretBuffer[byteIdx];
    for (let c = 1; c < threshold; c++) {
      coefficients[c] = randomBytes[byteIdx * coeffCount + (c - 1)];
    }
    for (let shareIdx = 0; shareIdx < totalShares; shareIdx++) {
      shares[shareIdx].data[byteIdx] = evaluatePolynomial(coefficients, shares[shareIdx].index);
    }
  }
  return shares;
}

/**
 * Combine shares to reconstruct the original secret
 *
 * @param {Array} shares - Array of share objects
 * @returns {Buffer} Reconstructed secret
 * @throws {Error} If shares are insufficient or malformed
 */
function combine(shares) {
  if (!Array.isArray(shares) || shares.length === 0) {
    const err = new Error("Shares must be a non-empty array");
    err.code = SSSError.INSUFFICIENT_SHARES;
    throw err;
  }
  if (shares.length < 2) {
    const err = new Error("At least 2 shares are required");
    err.code = SSSError.INSUFFICIENT_SHARES;
    throw err;
  }

  const secretLength = shares[0].data?.length;
  if (!secretLength) {
    const err = new Error("Invalid share format: missing data");
    err.code = SSSError.INVALID_SHARE_FORMAT;
    throw err;
  }

  const seenIndices = new Set();
  for (const share of shares) {
    if (typeof share.index !== "number" || share.index < 1 || share.index > 255) {
      const err = new Error(`Invalid share index: ${share.index}. Must be 1-255`);
      err.code = SSSError.INVALID_SHARE_FORMAT;
      throw err;
    }
    if (!Buffer.isBuffer(share.data) && !(share.data instanceof Uint8Array)) {
      const err = new Error("Share data must be a Buffer or Uint8Array");
      err.code = SSSError.INVALID_SHARE_FORMAT;
      throw err;
    }
    if (share.data.length !== secretLength) {
      const err = new Error(`Share data length mismatch: expected ${secretLength}, got ${share.data.length}`);
      err.code = SSSError.SHARE_INDEX_MISMATCH;
      throw err;
    }
    if (seenIndices.has(share.index)) {
      const err = new Error(`Duplicate share index: ${share.index}`);
      err.code = SSSError.DUPLICATE_SHARE_INDEX;
      throw err;
    }
    seenIndices.add(share.index);
  }

  const secret = Buffer.alloc(secretLength);
  for (let byteIdx = 0; byteIdx < secretLength; byteIdx++) {
    const points = shares.map((share) => ({ x: share.index, y: share.data[byteIdx] }));
    secret[byteIdx] = lagrangeInterpolate(points);
  }
  return secret;
}

/**
 * Generate a new random secret
 *
 * @param {number} length - Length in bytes (default: 32)
 * @returns {Buffer} Random secret
 */
function generateSecret(length = 32) {
  return crypto.randomBytes(length);
}

module.exports = {
  split,
  combine,
  serializeShare,
  deserializeShare,
  verifyShareFormat,
  generateSecret,
  SSSError,
  _gfMul: gfMul,
  _gfDiv: gfDiv,
  _gfAdd: gfAdd,
  _evaluatePolynomial: evaluatePolynomial,
  _lagrangeInterpolate: lagrangeInterpolate,
};
