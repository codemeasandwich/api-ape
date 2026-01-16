/**
 * @file Key derivation functions for browser (HKDF, Argon2id, PBKDF2)
 */
'use strict';

const {
  CryptoError,
  AES_KEY_LENGTH,
  PBKDF2_ITERATIONS,
} = require('./constants');
const {
  isCryptoAvailable,
  bufferToUint8Array,
  stringToUint8Array,
} = require('./encoding');

// Argon2 WASM module (lazy loaded)
let _argon2Module = null;
let _argon2Loading = null;

/**
 * Load argon2-browser module
 * @returns {Promise<Object|null>}
 */
async function loadArgon2() {
  if (_argon2Module) return _argon2Module;
  if (_argon2Loading) return _argon2Loading;

  _argon2Loading = (async () => {
    try {
      if (typeof window !== 'undefined' && window.argon2) {
        _argon2Module = window.argon2;
        return _argon2Module;
      }

      try {
        const module = await import('argon2-browser');
        _argon2Module = module.default || module;
        return _argon2Module;
      } catch {
        return null;
      }
    } catch {
      return null;
    } finally {
      _argon2Loading = null;
    }
  })();

  return _argon2Loading;
}

/**
 * Check if Argon2 is available
 * @returns {Promise<boolean>}
 */
async function isArgon2Available() {
  const argon2 = await loadArgon2();
  return argon2 !== null;
}

/**
 * HKDF key derivation using SHA-256
 * @param {Uint8Array|string} inputKeyMaterial - Input key material
 * @param {Uint8Array|string} salt - Salt value
 * @param {Uint8Array|string} info - Context info
 * @param {number} [length] - Output length
 * @returns {Promise<Uint8Array>}
 */
async function hkdf(inputKeyMaterial, salt, info, length = AES_KEY_LENGTH) {
  if (!isCryptoAvailable()) {
    const err = new Error('Web Crypto API not available');
    err.code = CryptoError.CRYPTO_NOT_AVAILABLE;
    throw err;
  }

  const ikmArray =
    typeof inputKeyMaterial === 'string'
      ? stringToUint8Array(inputKeyMaterial)
      : inputKeyMaterial;

  const saltArray =
    typeof salt === 'string'
      ? stringToUint8Array(salt)
      : salt || new Uint8Array(0);

  const infoArray =
    typeof info === 'string' ? stringToUint8Array(info) : info;

  const ikmKey = await crypto.subtle.importKey(
    'raw',
    ikmArray,
    'HKDF',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: saltArray,
      info: infoArray,
    },
    ikmKey,
    length * 8
  );

  return bufferToUint8Array(derivedBits);
}

/**
 * Derive key using Argon2id
 * Falls back to PBKDF2 if argon2-browser not available.
 * @param {Uint8Array|string} password - Password input
 * @param {Uint8Array} salt - 16+ byte salt
 * @param {Object} [options] - Argon2 options
 * @param {number} [options.memoryCost] - Memory in KB
 * @param {number} [options.timeCost] - Iterations
 * @param {number} [options.parallelism] - Threads
 * @param {number} [options.hashLength] - Output length
 * @returns {Promise<Uint8Array>}
 */
async function argon2id(password, salt, options = {}) {
  const {
    memoryCost = 65536,
    timeCost = 3,
    parallelism = 4,
    hashLength = AES_KEY_LENGTH,
  } = options;

  const passwordArray =
    typeof password === 'string' ? stringToUint8Array(password) : password;

  if (!(salt instanceof Uint8Array) || salt.length < 16) {
    const err = new Error('Salt must be a Uint8Array of at least 16 bytes');
    err.code = CryptoError.KDF_FAILED;
    throw err;
  }

  const argon2 = await loadArgon2();

  if (argon2) {
    try {
      const result = await argon2.hash({
        pass: passwordArray,
        salt,
        type: argon2.ArgonType.Argon2id,
        mem: memoryCost,
        time: timeCost,
        parallelism,
        hashLen: hashLength,
      });

      return new Uint8Array(result.hash);
    } catch (err) {
      const newErr = new Error(`Argon2id failed: ${err.message}`);
      newErr.code = CryptoError.KDF_FAILED;
      throw newErr;
    }
  }

  return pbkdf2Fallback(passwordArray, salt, PBKDF2_ITERATIONS, hashLength);
}

/**
 * PBKDF2 fallback for environments without Argon2
 * @param {Uint8Array|string} password - Password input
 * @param {Uint8Array} salt - Salt value
 * @param {number} [iterations] - PBKDF2 iterations
 * @param {number} [keyLength] - Output key length
 * @returns {Promise<Uint8Array>}
 */
async function pbkdf2Fallback(password, salt, iterations = PBKDF2_ITERATIONS, keyLength = AES_KEY_LENGTH) {
  if (!isCryptoAvailable()) {
    const err = new Error('Web Crypto API not available');
    err.code = CryptoError.CRYPTO_NOT_AVAILABLE;
    throw err;
  }

  const passwordArray =
    typeof password === 'string' ? stringToUint8Array(password) : password;

  if (!(salt instanceof Uint8Array)) {
    const err = new Error('Salt must be a Uint8Array');
    err.code = CryptoError.KDF_FAILED;
    throw err;
  }

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    passwordArray,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-512',
    },
    passwordKey,
    keyLength * 8
  );

  return bufferToUint8Array(derivedBits);
}

module.exports = {
  hkdf,
  argon2id,
  pbkdf2Fallback,
  isArgon2Available,
};
