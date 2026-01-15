/**
 * @file Share serialization and validation
 */
"use strict";

const { SSSError } = require("./constants");

/**
 * Serialize a share for storage/transmission
 * Format: [1 byte index][N bytes data] encoded as base64url
 *
 * @param {Object} share - Share to serialize
 * @param {number} share.index - Share index (1-255)
 * @param {Buffer} share.data - Share data
 * @returns {string} Base64url-encoded share
 */
function serializeShare(share) {
  if (!share || typeof share.index !== "number" || (!Buffer.isBuffer(share.data) && !(share.data instanceof Uint8Array))) {
    const err = new Error("Invalid share format for serialization");
    err.code = SSSError.INVALID_SHARE_FORMAT;
    throw err;
  }
  const packed = Buffer.alloc(1 + share.data.length);
  packed[0] = share.index;
  Buffer.from(share.data).copy(packed, 1);
  return packed.toString("base64url");
}

/**
 * Deserialize a share from storage/transmission
 *
 * @param {string} serialized - Serialized share string
 * @returns {Object} Deserialized share with index and data
 */
function deserializeShare(serialized) {
  if (typeof serialized !== "string" || serialized.length === 0) {
    const err = new Error("Serialized share must be a non-empty string");
    err.code = SSSError.INVALID_SHARE_FORMAT;
    throw err;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(serialized)) {
    const err = new Error("Invalid base64url encoding");
    err.code = SSSError.INVALID_SHARE_FORMAT;
    throw err;
  }
  const packed = Buffer.from(serialized, "base64url");
  if (packed.length < 2) {
    const err = new Error("Serialized share too short");
    err.code = SSSError.INVALID_SHARE_FORMAT;
    throw err;
  }
  if (packed[0] < 1) {
    const err = new Error("Invalid share index in serialized data");
    err.code = SSSError.INVALID_SHARE_FORMAT;
    throw err;
  }
  return { index: packed[0], data: Buffer.from(packed.slice(1)) };
}

/**
 * Verify a share has valid format
 *
 * @param {string|Object} share - Share to verify
 * @returns {boolean} True if format is valid
 */
function verifyShareFormat(share) {
  try {
    let parsed = share;
    if (typeof share === "string") parsed = deserializeShare(share);
    return (
      typeof parsed.index === "number" &&
      parsed.index >= 1 &&
      parsed.index <= 255 &&
      (Buffer.isBuffer(parsed.data) || parsed.data instanceof Uint8Array) &&
      parsed.data.length > 0
    );
  } catch {
    return false;
  }
}

module.exports = { serializeShare, deserializeShare, verifyShareFormat };
