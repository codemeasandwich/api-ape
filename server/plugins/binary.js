/**
 * @fileoverview Binary Data Transfer Plugins for JSS
 *
 * This module provides helper functions for checking binary data types.
 *
 * NOTE: The registerBinaryPlugins() function is commented out because:
 * 1. It is not called anywhere in the codebase
 * 2. It tries to register "I" tag which conflicts with the built-in JSS "I" tag
 * 3. Binary handling is already implemented in server/socket/tagUtils.js
 *
 * The helper functions (isBinaryData, INLINE_BASE64_THRESHOLD) are kept
 * as they may be useful for external code.
 *
 * @module server/plugins/binary
 * @see {@link module:server/socket/tagUtils} for actual binary handling
 */

/**
 * Maximum size in base64 characters for inline binary encoding
 * Data up to this size will be inlined as base64 in the message.
 * Larger data will use HTTP transfer (L tag).
 *
 * 100 base64 chars = 75 raw bytes
 * @constant {number}
 */
const INLINE_BASE64_THRESHOLD = 100;

/**
 * Check if a value is binary data
 *
 * @param {any} value - Value to check
 * @returns {boolean} True if value is Buffer, ArrayBuffer, or TypedArray
 */
function isBinaryData(value) {
  if (value === null || value === undefined) return false;
  return (
    Buffer.isBuffer(value) ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  );
}

/**
 * Get the base64 encoded length for binary data
 *
 * @param {Buffer|ArrayBuffer|ArrayBufferView} value - Binary data
 * @returns {number} Length when encoded as base64
 * @private
 */
function getBase64Length(value) {
  let byteLength;
  if (Buffer.isBuffer(value)) {
    byteLength = value.length;
  } else if (value instanceof ArrayBuffer) {
    byteLength = value.byteLength;
  } else if (ArrayBuffer.isView(value)) {
    byteLength = value.byteLength;
  } else {
    return Infinity; // Unknown type, use HTTP transfer
  }
  // Base64 encoding increases size by ~33%
  return Math.ceil((byteLength * 4) / 3);
}

// DEAD CODE: registerBinaryPlugins() is commented out because:
// 1. It is not called anywhere in the codebase
// 2. The "I" tag conflicts with the built-in JSS inline binary tag
// 3. Binary handling is already implemented via server/socket/tagUtils.js
//
// If this plugin system is needed in the future, the "I" tag registration
// should be removed (it's already built into JSS decode.js).
//
// function registerBinaryPlugins() { ... }
// function areBinaryPluginsRegistered() { ... }

module.exports = {
  isBinaryData,
  getBase64Length,
  INLINE_BASE64_THRESHOLD,
};
