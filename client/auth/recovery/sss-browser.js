/**
 * @file Shamir Secret Sharing for browser (GF(256))
 */
'use strict';

const { KeyRecoveryError } = require('./constants');

/**
 * Pre-computed log and exp tables for GF(256)
 * @type {Object}
 */
const GF256 = (function initGF256() {
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);

  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    exp[i + 255] = x;
    log[x] = i;
    x = x ^ ((x << 1) ^ (x & 0x80 ? 0x11b : 0));
  }
  log[0] = 0;
  exp[510] = exp[0];

  return { exp, log };
})();

/**
 * Multiply in GF(256)
 * @param {number} a - First operand
 * @param {number} b - Second operand
 * @returns {number}
 */
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF256.exp[GF256.log[a] + GF256.log[b]];
}

/**
 * Divide in GF(256)
 * @param {number} a - Dividend
 * @param {number} b - Divisor
 * @returns {number}
 */
function gfDiv(a, b) {
  if (b === 0) throw new Error('Division by zero in GF(256)');
  if (a === 0) return 0;
  return GF256.exp[GF256.log[a] + 255 - GF256.log[b]];
}

/**
 * Add in GF(256) (XOR)
 * @param {number} a - First operand
 * @param {number} b - Second operand
 * @returns {number}
 */
function gfAdd(a, b) {
  return a ^ b;
}

/**
 * Lagrange interpolation to find f(0)
 * @param {Array} points - Array of point objects
 * @returns {number}
 */
function lagrangeInterpolate(points) {
  let result = 0;

  for (let i = 0; i < points.length; i++) {
    let numerator = 1;
    let denominator = 1;

    for (let j = 0; j < points.length; j++) {
      if (i !== j) {
        numerator = gfMul(numerator, points[j].x);
        denominator = gfMul(denominator, gfAdd(points[i].x, points[j].x));
      }
    }

    const basis = gfMul(points[i].y, gfDiv(numerator, denominator));
    result = gfAdd(result, basis);
  }

  return result;
}

/**
 * Combine shares to reconstruct secret
 * @param {Array} shares - Share objects
 * @returns {Uint8Array}
 */
function combineShares(shares) {
  if (!Array.isArray(shares) || shares.length < 2) {
    const err = new Error('At least 2 shares required');
    err.code = KeyRecoveryError.INSUFFICIENT_FACTORS;
    throw err;
  }

  const secretLength = shares[0].data.length;
  const secret = new Uint8Array(secretLength);

  for (let byteIdx = 0; byteIdx < secretLength; byteIdx++) {
    const points = shares.map(share => ({
      x: share.index,
      y: share.data[byteIdx]
    }));
    secret[byteIdx] = lagrangeInterpolate(points);
  }

  return secret;
}

/**
 * Deserialize share from base64url
 * @param {string} serialized - Serialized share
 * @returns {Object}
 */
function deserializeShare(serialized) {
  if (typeof serialized !== 'string' || serialized.length === 0) {
    const err = new Error('Invalid serialized share');
    err.code = KeyRecoveryError.INVALID_FACTOR;
    throw err;
  }

  const base64 = serialized.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const packed = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    packed[i] = binary.charCodeAt(i);
  }

  if (packed.length < 2) {
    const err = new Error('Serialized share too short');
    err.code = KeyRecoveryError.INVALID_FACTOR;
    throw err;
  }

  return {
    index: packed[0],
    data: packed.slice(1)
  };
}

/**
 * Serialize share to base64url
 * @param {Object} share - Share to serialize
 * @param {number} share.index - Share index
 * @param {Uint8Array} share.data - Share data
 * @returns {string}
 */
function serializeShare(share) {
  const packed = new Uint8Array(1 + share.data.length);
  packed[0] = share.index;
  packed.set(share.data, 1);

  let binary = '';
  for (let i = 0; i < packed.length; i++) {
    binary += String.fromCharCode(packed[i]);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Evaluate polynomial at x using Horner's method
 * @param {Uint8Array} coefficients - Polynomial coefficients
 * @param {number} x - Point to evaluate
 * @returns {number}
 */
function evaluatePolynomial(coefficients, x) {
  let result = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) {
    result = gfAdd(gfMul(result, x), coefficients[i]);
  }
  return result;
}

module.exports = {
  combineShares,
  deserializeShare,
  serializeShare,
  evaluatePolynomial,
  lagrangeInterpolate,
  gfMul,
  gfDiv,
  gfAdd,
  GF256,
};
