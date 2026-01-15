/**
 * @file Data encoding utilities for browser crypto
 */
'use strict';

/**
 * Check if Web Crypto API is available
 * @returns {boolean}
 */
function isCryptoAvailable() {
  return typeof crypto !== 'undefined' && crypto.subtle;
}

/**
 * Convert ArrayBuffer to Uint8Array
 * @param {ArrayBuffer} buffer - Buffer to convert
 * @returns {Uint8Array}
 */
function bufferToUint8Array(buffer) {
  return new Uint8Array(buffer);
}

/**
 * Convert string to Uint8Array
 * @param {string} str - String to convert
 * @returns {Uint8Array}
 */
function stringToUint8Array(str) {
  return new TextEncoder().encode(str);
}

/**
 * Convert Uint8Array to string
 * @param {Uint8Array} array - Array to convert
 * @returns {string}
 */
function uint8ArrayToString(array) {
  return new TextDecoder().decode(array);
}

/**
 * Convert Uint8Array to base64
 * @param {Uint8Array} array - Array to convert
 * @returns {string}
 */
function uint8ArrayToBase64(array) {
  let binary = '';
  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 to Uint8Array
 * @param {string} base64 - Base64 string to convert
 * @returns {Uint8Array}
 */
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return array;
}

/**
 * Generate random bytes
 * @param {number} length - Number of bytes
 * @returns {Uint8Array}
 */
function randomBytes(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

/**
 * Timing-safe comparison (best effort in browser)
 * @param {Uint8Array} a - First array
 * @param {Uint8Array} b - Second array
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

module.exports = {
  isCryptoAvailable,
  bufferToUint8Array,
  stringToUint8Array,
  uint8ArrayToString,
  uint8ArrayToBase64,
  base64ToUint8Array,
  randomBytes,
  timingSafeEqual,
};
