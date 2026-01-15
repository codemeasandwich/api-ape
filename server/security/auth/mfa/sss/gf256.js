/**
 * @file GF(256) Galois Field arithmetic
 */
"use strict";

const { SSSError } = require("./constants");

/**
 * Pre-computed log and exp tables for GF(256) with generator 0x03
 * Using the irreducible polynomial x^8 + x^4 + x^3 + x + 1 (0x11B)
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
    x = x ^ (x << 1) ^ (x & 0x80 ? 0x11b : 0);
  }
  log[0] = 0;
  exp[510] = exp[0];
  return { exp, log };
})();

/**
 * Multiply two elements in GF(256)
 * @param {number} a - First operand (0-255)
 * @param {number} b - Second operand (0-255)
 * @returns {number} Product in GF(256)
 */
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF256.exp[GF256.log[a] + GF256.log[b]];
}

/**
 * Divide two elements in GF(256)
 * @param {number} a - Dividend (0-255)
 * @param {number} b - Divisor (1-255, non-zero)
 * @returns {number} Quotient in GF(256)
 * @throws {Error} If divisor is zero
 */
function gfDiv(a, b) {
  if (b === 0) {
    const err = new Error("Division by zero in GF(256)");
    err.code = SSSError.RECONSTRUCTION_FAILED;
    throw err;
  }
  if (a === 0) return 0;
  return GF256.exp[GF256.log[a] + 255 - GF256.log[b]];
}

/**
 * Add/subtract two elements in GF(256) (XOR operation)
 * @param {number} a - First operand
 * @param {number} b - Second operand
 * @returns {number} Sum/difference in GF(256)
 */
function gfAdd(a, b) {
  return a ^ b;
}

/**
 * Evaluate a polynomial at a given x value in GF(256)
 * Uses Horner's method for efficiency
 * @param {Uint8Array} coefficients - Polynomial coefficients
 * @param {number} x - Point to evaluate at
 * @returns {number} f(x) in GF(256)
 */
function evaluatePolynomial(coefficients, x) {
  let result = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) {
    result = gfAdd(gfMul(result, x), coefficients[i]);
  }
  return result;
}

/**
 * Lagrange interpolation to find f(0) given points
 * @param {Array} points - Array of point objects with x and y properties
 * @returns {number} f(0) - the secret byte
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

module.exports = { GF256, gfMul, gfDiv, gfAdd, evaluatePolynomial, lagrangeInterpolate };
