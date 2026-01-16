/**
 * @file AES-256-GCM AEAD encryption for browser
 */
'use strict';

const {
  CryptoError,
  AES_KEY_LENGTH,
  GCM_NONCE_LENGTH,
  GCM_TAG_LENGTH,
} = require('./constants');
const {
  isCryptoAvailable,
  bufferToUint8Array,
  stringToUint8Array,
  randomBytes,
} = require('./encoding');

/**
 * Import raw key for AES-GCM
 * @param {Uint8Array} keyData - Key bytes
 * @returns {Promise<CryptoKey>}
 */
async function importKey(keyData) {
  return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Encrypt data using AES-256-GCM with AEAD
 * @param {Uint8Array} key - 32-byte encryption key
 * @param {Uint8Array|string} plaintext - Data to encrypt
 * @param {Uint8Array|string} [aad] - Additional authenticated data
 * @returns {Promise<Object>} Encrypted data components
 */
async function aeadEncrypt(key, plaintext, aad = '') {
  if (!isCryptoAvailable()) {
    const err = new Error('Web Crypto API not available');
    err.code = CryptoError.CRYPTO_NOT_AVAILABLE;
    throw err;
  }

  if (!(key instanceof Uint8Array) || key.length !== AES_KEY_LENGTH) {
    const err = new Error(`Key must be a ${AES_KEY_LENGTH}-byte Uint8Array`);
    err.code = CryptoError.INVALID_KEY_LENGTH;
    throw err;
  }

  const plaintextArray =
    typeof plaintext === 'string' ? stringToUint8Array(plaintext) : plaintext;
  const aadArray =
    typeof aad === 'string' ? stringToUint8Array(aad) : aad || new Uint8Array(0);

  const nonce = randomBytes(GCM_NONCE_LENGTH);
  const cryptoKey = await importKey(key);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: aadArray,
      tagLength: GCM_TAG_LENGTH * 8,
    },
    cryptoKey,
    plaintextArray
  );

  const encrypted = bufferToUint8Array(encryptedBuffer);
  const ciphertext = encrypted.slice(0, encrypted.length - GCM_TAG_LENGTH);
  const tag = encrypted.slice(encrypted.length - GCM_TAG_LENGTH);

  return { ciphertext, nonce, tag };
}

/**
 * Decrypt data using AES-256-GCM with AEAD
 * @param {Uint8Array} key - 32-byte decryption key
 * @param {Uint8Array} ciphertext - Data to decrypt
 * @param {Uint8Array} nonce - 12-byte nonce
 * @param {Uint8Array} tag - 16-byte auth tag
 * @param {Uint8Array|string} [aad] - Additional authenticated data
 * @returns {Promise<Uint8Array>} Decrypted plaintext
 */
async function aeadDecrypt(key, ciphertext, nonce, tag, aad = '') {
  if (!isCryptoAvailable()) {
    const err = new Error('Web Crypto API not available');
    err.code = CryptoError.CRYPTO_NOT_AVAILABLE;
    throw err;
  }

  if (!(key instanceof Uint8Array) || key.length !== AES_KEY_LENGTH) {
    const err = new Error(`Key must be a ${AES_KEY_LENGTH}-byte Uint8Array`);
    err.code = CryptoError.INVALID_KEY_LENGTH;
    throw err;
  }

  if (!(nonce instanceof Uint8Array) || nonce.length !== GCM_NONCE_LENGTH) {
    const err = new Error(`Nonce must be a ${GCM_NONCE_LENGTH}-byte Uint8Array`);
    err.code = CryptoError.INVALID_NONCE;
    throw err;
  }

  if (!(tag instanceof Uint8Array) || tag.length !== GCM_TAG_LENGTH) {
    const err = new Error(`Tag must be a ${GCM_TAG_LENGTH}-byte Uint8Array`);
    err.code = CryptoError.INVALID_TAG;
    throw err;
  }

  const aadArray =
    typeof aad === 'string' ? stringToUint8Array(aad) : aad || new Uint8Array(0);

  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);

  const cryptoKey = await importKey(key);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: aadArray,
        tagLength: GCM_TAG_LENGTH * 8,
      },
      cryptoKey,
      combined
    );

    return bufferToUint8Array(decryptedBuffer);
  } catch {
    const err = new Error('Decryption failed: authentication tag mismatch');
    err.code = CryptoError.DECRYPTION_FAILED;
    throw err;
  }
}

/**
 * Pack encrypted data into single Uint8Array for storage
 * Format: [nonce:12][tag:16][ciphertext:N]
 * @param {Object} encrypted - Encrypted data components
 * @param {Uint8Array} encrypted.ciphertext - The encrypted data
 * @param {Uint8Array} encrypted.nonce - The nonce
 * @param {Uint8Array} encrypted.tag - The auth tag
 * @returns {Uint8Array}
 */
function packEncrypted(encrypted) {
  const { ciphertext, nonce, tag } = encrypted;
  const packed = new Uint8Array(nonce.length + tag.length + ciphertext.length);
  packed.set(nonce);
  packed.set(tag, nonce.length);
  packed.set(ciphertext, nonce.length + tag.length);
  return packed;
}

/**
 * Unpack encrypted data from storage format
 * @param {Uint8Array} packed - Packed encrypted data
 * @returns {Object} Unpacked components
 */
function unpackEncrypted(packed) {
  if (!(packed instanceof Uint8Array)) {
    const err = new Error('Packed data must be a Uint8Array');
    err.code = CryptoError.INVALID_CIPHERTEXT;
    throw err;
  }

  const minLength = GCM_NONCE_LENGTH + GCM_TAG_LENGTH;
  if (packed.length < minLength) {
    const err = new Error(`Packed data too short: minimum ${minLength} bytes`);
    err.code = CryptoError.INVALID_CIPHERTEXT;
    throw err;
  }

  const nonce = packed.slice(0, GCM_NONCE_LENGTH);
  const tag = packed.slice(GCM_NONCE_LENGTH, GCM_NONCE_LENGTH + GCM_TAG_LENGTH);
  const ciphertext = packed.slice(GCM_NONCE_LENGTH + GCM_TAG_LENGTH);

  return { ciphertext, nonce, tag };
}

/**
 * Encrypt and pack in one step
 * @param {Uint8Array} key - Encryption key
 * @param {Uint8Array|string} plaintext - Data to encrypt
 * @param {Uint8Array|string} [aad] - Additional authenticated data
 * @returns {Promise<Uint8Array>}
 */
async function encryptAndPack(key, plaintext, aad = '') {
  return packEncrypted(await aeadEncrypt(key, plaintext, aad));
}

/**
 * Unpack and decrypt in one step
 * @param {Uint8Array} key - Decryption key
 * @param {Uint8Array} packed - Packed encrypted data
 * @param {Uint8Array|string} [aad] - Additional authenticated data
 * @returns {Promise<Uint8Array>}
 */
async function unpackAndDecrypt(key, packed, aad = '') {
  const { ciphertext, nonce, tag } = unpackEncrypted(packed);
  return aeadDecrypt(key, ciphertext, nonce, tag, aad);
}

module.exports = {
  aeadEncrypt,
  aeadDecrypt,
  packEncrypted,
  unpackEncrypted,
  encryptAndPack,
  unpackAndDecrypt,
};
