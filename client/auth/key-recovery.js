/**
 * @file Client SDK for 2-of-3 Key Recovery
 *
 * Provides client-side key reconstruction using Shamir Secret Sharing.
 * Works with server-side two-of-three adapter for HIGH_SECURITY (Tier 3).
 *
 * @module client/auth/key-recovery
 */
'use strict';

const cryptoUtils = require('./crypto-utils');
const shareStorage = require('./share-storage');
const { KeyRecoveryError, FactorType } = require('./recovery/constants');
const { combineShares, deserializeShare, serializeShare, evaluatePolynomial } = require('./recovery/sss-browser');
const { deriveS1Key, deriveS2Key, deriveS3Key } = require('./recovery/key-derivation');

/**
 * Client SDK for 2-of-3 key recovery
 */
class KeyRecoveryClient {
  /**
   * Create a KeyRecoveryClient
   * @param {Object} options - Client options
   * @param {Function} options.sendMessage - Server message function
   * @param {string} [options.rpId] - WebAuthn relying party ID
   */
  constructor(options = {}) {
    if (!options.sendMessage || typeof options.sendMessage !== 'function') {
      throw new Error('sendMessage function is required');
    }
    this.sendMessage = options.sendMessage;
    this.rpId = options.rpId || (typeof location !== 'undefined' ? location.hostname : 'localhost');
    this._pendingEnrollment = null;
    this._pendingRecovery = null;
  }

  /**
   * Check if user is enrolled
   * @param {string} userId - User identifier
   * @returns {Promise<boolean>}
   */
  async isEnrolled(userId) {
    return shareStorage.isEnrolled(userId);
  }

  /**
   * Enroll in key recovery
   * @param {Object} params - Enrollment parameters
   * @param {string} params.userId - User identifier
   * @param {string} params.oauthToken - OAuth token
   * @param {string} params.totpSeed - TOTP seed
   * @param {Uint8Array} params.webauthnAuthData - WebAuthn data
   * @param {string} params.webauthnCredentialId - Credential ID
   * @returns {Promise<Object>}
   */
  async enroll(params) {
    const { userId, oauthToken, totpSeed, webauthnAuthData, webauthnCredentialId } = params;

    if (!userId) throw new Error('userId is required');
    if (!oauthToken) throw new Error('oauthToken is required');
    if (!totpSeed) throw new Error('totpSeed is required');
    if (!webauthnAuthData) throw new Error('webauthnAuthData is required');
    if (!webauthnCredentialId) throw new Error('webauthnCredentialId is required');

    const enrolled = await this.isEnrolled(userId);
    if (enrolled) {
      const err = new Error('User already enrolled');
      err.code = KeyRecoveryError.ALREADY_ENROLLED;
      throw err;
    }

    try {
      const kUser = cryptoUtils.generateKey(32);
      const shares = this._splitSecret(kUser, 2, 3);

      const s1Salt = cryptoUtils.generateSalt(16);
      const s3Salt = cryptoUtils.generateSalt(16);

      const [s1Key, s2Key, s3Key] = await Promise.all([
        deriveS1Key(oauthToken, userId),
        deriveS2Key(webauthnAuthData, webauthnCredentialId),
        deriveS3Key(totpSeed, s3Salt)
      ]);

      const [encS1, encS2, encS3] = await Promise.all([
        cryptoUtils.encryptAndPack(s1Key, shares[0].data, `s1:${userId}`),
        cryptoUtils.encryptAndPack(s2Key, shares[1].data, `s2:${userId}`),
        cryptoUtils.encryptAndPack(s3Key, shares[2].data, `s3:${userId}`)
      ]);

      const storage = shareStorage.createUserStorage(userId);
      await storage.saveShare('S2', cryptoUtils.uint8ArrayToBase64(encS2), 1);
      await storage.saveWrappedKey(webauthnCredentialId, cryptoUtils.uint8ArrayToBase64(s2Key));
      await storage.saveMetadata({
        enrolledAt: Date.now(),
        shareCount: 3,
        s3Salt: cryptoUtils.uint8ArrayToBase64(s3Salt)
      });

      const proof = await this._generateProof(kUser, userId);

      const response = await this.sendMessage({
        type: 'key_recovery_enrollment_finish',
        userId,
        encShares: {
          S1: cryptoUtils.uint8ArrayToBase64(encS1),
          S1_salt: cryptoUtils.uint8ArrayToBase64(s1Salt),
          S3: cryptoUtils.uint8ArrayToBase64(encS3),
          S3_salt: cryptoUtils.uint8ArrayToBase64(s3Salt)
        },
        shareIndices: { S1: shares[0].index, S2: shares[1].index, S3: shares[2].index },
        proof
      });

      if (response.type === 'error') {
        await storage.deleteAll();
        const err = new Error(response.message || 'Enrollment failed');
        err.code = KeyRecoveryError.SERVER_ERROR;
        throw err;
      }

      return { kUser, proof };
    } catch (err) {
      try { await shareStorage.deleteAllUserData(userId); } catch { /* ignore */ }
      throw err;
    }
  }

  /**
   * Recover K_user using 2 of 3 factors
   * @param {Object} params - Recovery parameters
   * @param {string} params.userId - User identifier
   * @param {Array<string>} params.factors - Factor types to use
   * @param {Object} params.factorData - Data for each factor
   * @returns {Promise<Uint8Array>}
   */
  async recover(params) {
    const { userId, factors, factorData = {} } = params;

    if (!userId) throw new Error('userId is required');

    // Check enrollment
    const enrolled = await this.isEnrolled(userId);
    if (!enrolled) {
      const err = new Error('User not enrolled');
      err.code = KeyRecoveryError.NOT_ENROLLED;
      throw err;
    }

    // Validate factors array
    if (!Array.isArray(factors) || factors.length !== 2) {
      const err = new Error('Exactly 2 factors required');
      err.code = KeyRecoveryError.INSUFFICIENT_FACTORS;
      throw err;
    }

    // Validate factor types
    const validFactors = Object.values(FactorType);
    for (const factor of factors) {
      if (!validFactors.includes(factor)) {
        const err = new Error(`Unknown factor: ${factor}`);
        err.code = KeyRecoveryError.INVALID_FACTOR;
        throw err;
      }
    }

    const response = await this.sendMessage({ type: 'key_recovery_start', userId });

    if (response.type !== 'key_recovery_shares') {
      const err = new Error(response.message || 'Recovery failed');
      err.code = KeyRecoveryError.SERVER_ERROR;
      throw err;
    }

    const decryptedShares = [];

    if (factors.includes(FactorType.OAUTH) && response.encShares?.S1) {
      const s1Key = await deriveS1Key(factorData.oauthToken, userId);
      const encData = cryptoUtils.base64ToUint8Array(response.encShares.S1);
      const shareData = await cryptoUtils.unpackAndDecrypt(s1Key, encData, `s1:${userId}`);
      decryptedShares.push({ index: response.encShares.S1_index || 1, data: shareData });
    }

    if (factors.includes(FactorType.WEBAUTHN)) {
      const storage = shareStorage.createUserStorage(userId);
      const share = await storage.getShare('S2');
      if (share) {
        const s2Key = await deriveS2Key(factorData.webauthnAuthData, factorData.webauthnCredentialId);
        const encData = cryptoUtils.base64ToUint8Array(share.encryptedShare);
        const shareData = await cryptoUtils.unpackAndDecrypt(s2Key, encData, `s2:${userId}`);
        decryptedShares.push({ index: response.encShares?.S2_index || 2, data: shareData });
      }
    }

    if (factors.includes(FactorType.TOTP) && response.encShares?.S3) {
      const metadata = await shareStorage.getMetadata(userId);
      const s3Salt = metadata?.s3Salt ? cryptoUtils.base64ToUint8Array(metadata.s3Salt) : cryptoUtils.generateSalt(16);
      const s3Key = await deriveS3Key(factorData.totpSeed, s3Salt);
      const encData = cryptoUtils.base64ToUint8Array(response.encShares.S3);
      const shareData = await cryptoUtils.unpackAndDecrypt(s3Key, encData, `s3:${userId}`);
      decryptedShares.push({ index: response.encShares.S3_index || 3, data: shareData });
    }

    if (decryptedShares.length < 2) {
      const err = new Error('Could not decrypt enough shares');
      err.code = KeyRecoveryError.DECRYPTION_FAILED;
      throw err;
    }

    const kUser = combineShares(decryptedShares.slice(0, 2));
    const proof = await this._generateProof(kUser, userId);

    await this.sendMessage({ type: 'key_recovery_complete', userId, proof });
    return kUser;
  }

  /**
   * Unenroll from key recovery
   * @param {string} userId - User identifier
   * @returns {Promise<void>}
   */
  async unenroll(userId) {
    await shareStorage.deleteAllUserData(userId);
    await this.sendMessage({ type: 'key_recovery_unenroll', userId });
  }

  /**
   * Split secret using SSS
   * @private
   * @param {Uint8Array} secret - Secret to split
   * @param {number} threshold - Threshold
   * @param {number} totalShares - Total shares
   * @returns {Array}
   */
  _splitSecret(secret, threshold, totalShares) {
    const shares = [];
    for (let i = 0; i < totalShares; i++) {
      shares.push({ index: i + 1, data: new Uint8Array(secret.length) });
    }

    for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
      const coefficients = new Uint8Array(threshold);
      coefficients[0] = secret[byteIdx];
      for (let c = 1; c < threshold; c++) {
        coefficients[c] = cryptoUtils.randomBytes(1)[0];
      }
      for (let shareIdx = 0; shareIdx < totalShares; shareIdx++) {
        shares[shareIdx].data[byteIdx] = evaluatePolynomial(coefficients, shares[shareIdx].index);
      }
    }

    return shares;
  }

  /**
   * Generate K_user proof
   * @private
   * @param {Uint8Array} kUser - User key
   * @param {string} userId - User identifier
   * @returns {Promise<string>}
   */
  async _generateProof(kUser, userId) {
    const key = await crypto.subtle.importKey('raw', kUser, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const data = cryptoUtils.stringToUint8Array(`api-ape:key-recovery:proof:${userId}`);
    const signature = await crypto.subtle.sign('HMAC', key, data);
    return cryptoUtils.uint8ArrayToBase64(new Uint8Array(signature));
  }
}

const { gfMul, gfDiv, gfAdd, lagrangeInterpolate } = require('./recovery/sss-browser');

module.exports = {
  KeyRecoveryClient,
  KeyRecoveryError,
  FactorType,
  deriveS1Key,
  deriveS2Key,
  deriveS3Key,
  combineShares,
  deserializeShare,
  serializeShare,

  // Expose for testing
  _gfMul: gfMul,
  _gfDiv: gfDiv,
  _gfAdd: gfAdd,
  _lagrangeInterpolate: lagrangeInterpolate,
};
