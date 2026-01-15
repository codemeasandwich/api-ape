/**
 * @file AEAD encryption using AES-256-GCM
 */
"use strict";

const crypto = require("crypto");
const { CryptoError, AES_KEY_LENGTH, GCM_NONCE_LENGTH, GCM_TAG_LENGTH } = require("./constants");

/**
 * Encrypt data using AES-256-GCM with AEAD
 *
 * @param {Buffer} key - 32-byte encryption key
 * @param {Buffer|string} plaintext - Data to encrypt
 * @param {Buffer|string} aad - Additional authenticated data
 * @returns {Object} Encrypted data with ciphertext, nonce, tag
 */
function aeadEncrypt(key, plaintext, aad = "") {
  if (!Buffer.isBuffer(key) || key.length !== AES_KEY_LENGTH) {
    const err = new Error(`Key must be a ${AES_KEY_LENGTH}-byte Buffer, got ${key?.length || "invalid"}`);
    err.code = CryptoError.INVALID_KEY_LENGTH;
    throw err;
  }

  const plaintextBuf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);
  const aadBuf = Buffer.isBuffer(aad) ? aad : Buffer.from(aad);
  const nonce = crypto.randomBytes(GCM_NONCE_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce, { authTagLength: GCM_TAG_LENGTH });
  cipher.setAAD(aadBuf);
  const ciphertext = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const tag = cipher.getAuthTag();

  return { ciphertext, nonce, tag };
}

/**
 * Decrypt data using AES-256-GCM with AEAD
 *
 * @param {Buffer} key - 32-byte decryption key
 * @param {Buffer} ciphertext - Data to decrypt
 * @param {Buffer} nonce - 12-byte nonce
 * @param {Buffer} tag - 16-byte auth tag
 * @param {Buffer|string} aad - Additional authenticated data
 * @returns {Buffer} Decrypted plaintext
 */
function aeadDecrypt(key, ciphertext, nonce, tag, aad = "") {
  if (!Buffer.isBuffer(key) || key.length !== AES_KEY_LENGTH) {
    const err = new Error(`Key must be a ${AES_KEY_LENGTH}-byte Buffer`);
    err.code = CryptoError.INVALID_KEY_LENGTH;
    throw err;
  }
  if (!Buffer.isBuffer(nonce) || nonce.length !== GCM_NONCE_LENGTH) {
    const err = new Error(`Nonce must be a ${GCM_NONCE_LENGTH}-byte Buffer`);
    err.code = CryptoError.INVALID_NONCE;
    throw err;
  }
  if (!Buffer.isBuffer(tag) || tag.length !== GCM_TAG_LENGTH) {
    const err = new Error(`Tag must be a ${GCM_TAG_LENGTH}-byte Buffer`);
    err.code = CryptoError.INVALID_TAG;
    throw err;
  }
  if (!Buffer.isBuffer(ciphertext)) {
    const err = new Error("Ciphertext must be a Buffer");
    err.code = CryptoError.INVALID_CIPHERTEXT;
    throw err;
  }

  const aadBuf = Buffer.isBuffer(aad) ? aad : Buffer.from(aad);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: GCM_TAG_LENGTH });
  decipher.setAAD(aadBuf);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (e) {
    const err = new Error("Decryption failed: authentication tag mismatch or corrupted data");
    err.code = CryptoError.DECRYPTION_FAILED;
    throw err;
  }
}

/**
 * Pack encrypted components into a single Buffer
 *
 * @param {Buffer|Object} nonceOrObj - Nonce or encrypted object
 * @param {Buffer} tag - Auth tag (if first arg is nonce)
 * @param {Buffer} ciphertext - Ciphertext (if first arg is nonce)
 * @returns {Buffer} Packed buffer
 */
function packEncrypted(nonceOrObj, tag, ciphertext) {
  if (nonceOrObj && typeof nonceOrObj === "object" && "nonce" in nonceOrObj) {
    return Buffer.concat([nonceOrObj.nonce, nonceOrObj.tag, nonceOrObj.ciphertext]);
  }
  return Buffer.concat([nonceOrObj, tag, ciphertext]);
}

/**
 * Unpack encrypted Buffer into components
 *
 * @param {Buffer} packed - Packed buffer
 * @returns {Object} Components with nonce, tag, ciphertext
 */
function unpackEncrypted(packed) {
  if (!Buffer.isBuffer(packed) || packed.length < GCM_NONCE_LENGTH + GCM_TAG_LENGTH) {
    const err = new Error("Invalid packed data: too short");
    err.code = CryptoError.INVALID_CIPHERTEXT;
    throw err;
  }
  return {
    nonce: packed.slice(0, GCM_NONCE_LENGTH),
    tag: packed.slice(GCM_NONCE_LENGTH, GCM_NONCE_LENGTH + GCM_TAG_LENGTH),
    ciphertext: packed.slice(GCM_NONCE_LENGTH + GCM_TAG_LENGTH),
  };
}

/**
 * Encrypt and pack in one step
 *
 * @param {Buffer} key - Encryption key
 * @param {Buffer|string} plaintext - Data to encrypt
 * @param {Buffer|string} aad - Additional authenticated data
 * @returns {Buffer} Packed encrypted data
 */
function encryptAndPack(key, plaintext, aad = "") {
  const { ciphertext, nonce, tag } = aeadEncrypt(key, plaintext, aad);
  return packEncrypted(nonce, tag, ciphertext);
}

/**
 * Unpack and decrypt in one step
 *
 * @param {Buffer} key - Decryption key
 * @param {Buffer} packed - Packed encrypted data
 * @param {Buffer|string} aad - Additional authenticated data
 * @returns {Buffer} Decrypted plaintext
 */
function unpackAndDecrypt(key, packed, aad = "") {
  const { nonce, tag, ciphertext } = unpackEncrypted(packed);
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
