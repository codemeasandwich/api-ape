/**
 * @file Two-of-three enrollment, recovery, and rotation handlers
 */
"use strict";

const crypto = require("crypto");
const { serializeShare, generateSecret } = require("../sss");
const { generateSalt } = require("../crypto-utils");
const { ShareId, FactorType } = require("../ledger");
const { TwoOfThreeMessageType, TwoOfThreeError } = require("./constants");
const { generateChallenge, computeProofHash, getEnrollmentKey } = require("./helpers");

/**
 * Create enrollment handlers
 * @param {Object} ctx - Context with ledger, maps, and config
 * @returns {Object} Enrollment handler functions
 */
function createEnrollmentHandlers(ctx) {
  const { ledger, pendingEnrollments, enrollmentTimeout, secretLength, cleanupExpired } = ctx;

  /**
   * Handle enrollment start
   * @param {Object} params - Parameters
   * @param {string} params.clientId - Client ID
   * @param {string} params.userId - User ID
   * @returns {Promise<Object>} Enrollment challenge
   */
  async function handleEnrollmentStart({ clientId, userId }) {
    cleanupExpired();

    if (await ledger.isEnrolled(userId)) {
      const err = new Error(`User ${userId} is already enrolled`);
      err.code = TwoOfThreeError.ALREADY_ENROLLED;
      throw err;
    }

    const key = getEnrollmentKey(clientId, userId);
    if (pendingEnrollments.has(key)) {
      const err = new Error("Enrollment already in progress");
      err.code = TwoOfThreeError.PENDING_ENROLLMENT;
      throw err;
    }

    const kUser = generateSecret(secretLength);
    const shares = require("../sss").split(kUser, 2, 3);
    const challenge = generateChallenge();
    const s3Salt = generateSalt(16);

    pendingEnrollments.set(key, { userId, challenge, kUser, shares, s3Salt, expiresAt: Date.now() + enrollmentTimeout });
    setTimeout(() => pendingEnrollments.delete(key), enrollmentTimeout + 1000);

    return {
      type: TwoOfThreeMessageType.ENROLLMENT_CHALLENGE,
      challenge,
      s3Salt: s3Salt.toString("base64"),
      factorRequirements: {
        S1: { factor: "oauth", description: "OAuth/OPAQUE authentication" },
        S2: { factor: "webauthn", description: "WebAuthn credential" },
        S3: { factor: "totp", description: "TOTP authenticator" },
      },
      shares: { S1: serializeShare(shares[0]), S2: serializeShare(shares[1]), S3: serializeShare(shares[2]) },
    };
  }

  /**
   * Handle enrollment finish
   * @param {Object} params - Parameters
   * @param {string} params.clientId - Client ID
   * @param {string} params.userId - User ID
   * @param {Object} params.encryptedShares - Encrypted shares
   * @returns {Promise<Object>} Enrollment result
   */
  async function handleEnrollmentFinish({ clientId, userId, encryptedShares }) {
    cleanupExpired();

    const key = getEnrollmentKey(clientId, userId);
    const pending = pendingEnrollments.get(key);

    if (!pending) {
      const err = new Error("No pending enrollment found or enrollment expired");
      err.code = TwoOfThreeError.ENROLLMENT_EXPIRED;
      throw err;
    }

    // DEAD: cleanupExpired() at the top of this handler already removed any
    // entry with `expiresAt < now`. If `pending` is still defined here, its
    // expiresAt is in the future. To be removed at step 7.
    // if (pending.expiresAt < Date.now()) {
    //   pendingEnrollments.delete(key);
    //   const err = new Error("Enrollment has expired");
    //   err.code = TwoOfThreeError.ENROLLMENT_EXPIRED;
    //   throw err;
    // }

    if (!encryptedShares?.S1 || !encryptedShares?.S3) {
      const err = new Error("Missing encrypted shares (S1 and S3 required)");
      err.code = TwoOfThreeError.INVALID_FACTOR;
      throw err;
    }

    const proofHash = computeProofHash(pending.kUser);

    await ledger.storeShares(userId, {
      [ShareId.S1]: { factor: FactorType.OAUTH, data: Buffer.from(encryptedShares.S1, "base64") },
      [ShareId.S3]: { factor: FactorType.TOTP, data: Buffer.from(encryptedShares.S3, "base64") },
    }, { proofHash });

    pendingEnrollments.delete(key);

    return {
      type: TwoOfThreeMessageType.ENROLLMENT_OK,
      userId,
      shares: {
        S1: { stored: true, factor: FactorType.OAUTH },
        S2: { stored: false, factor: FactorType.WEBAUTHN, note: "Client-stored" },
        S3: { stored: true, factor: FactorType.TOTP },
      },
    };
  }

  return { handleEnrollmentStart, handleEnrollmentFinish };
}

/**
 * Create recovery handlers
 * @param {Object} ctx - Context with ledger, maps, and config
 * @returns {Object} Recovery handler functions
 */
function createRecoveryHandlers(ctx) {
  const { ledger, pendingRecoveries, enrollmentTimeout, cleanupExpired } = ctx;

  /**
   * Handle recovery start
   * @param {Object} params - Parameters
   * @param {string} params.clientId - Client ID
   * @param {string} params.userId - User ID
   * @returns {Promise<Object>} Recovery shares and challenge
   */
  async function handleRecoveryStart({ clientId, userId }) {
    cleanupExpired();

    if (!(await ledger.isEnrolled(userId))) {
      const err = new Error(`User ${userId} is not enrolled in key recovery`);
      err.code = TwoOfThreeError.NOT_ENROLLED;
      throw err;
    }

    const { shares, metadata } = await ledger.fetchShares(userId, [ShareId.S1, ShareId.S3]);
    const challenge = generateChallenge();
    const key = getEnrollmentKey(clientId, userId);
    pendingRecoveries.set(key, { userId, challenge, expiresAt: Date.now() + enrollmentTimeout });

    return {
      type: TwoOfThreeMessageType.RECOVERY_SHARES,
      challenge,
      encShares: { S1: shares[ShareId.S1]?.toString("base64") || null, S3: shares[ShareId.S3]?.toString("base64") || null },
      metadata: { S1: metadata[ShareId.S1], S2: metadata[ShareId.S2], S3: metadata[ShareId.S3] },
    };
  }

  /**
   * Handle recovery complete
   * @param {Object} params - Parameters
   * @param {string} params.clientId - Client ID
   * @param {string} params.userId - User ID
   * @param {string} params.proof - Recovery proof
   * @returns {Promise<Object>} Recovery result
   */
  async function handleRecoveryComplete({ clientId, userId, proof }) {
    cleanupExpired();

    const key = getEnrollmentKey(clientId, userId);
    const pending = pendingRecoveries.get(key);

    if (!pending) {
      const err = new Error("No pending recovery found");
      err.code = TwoOfThreeError.INVALID_FLOW;
      throw err;
    }

    if (proof) {
      const storedProofHash = await ledger.getProofHash(userId);
      if (storedProofHash) {
        const expectedProof = crypto.createHmac("sha256", storedProofHash).update(pending.challenge).digest("base64");
        if (proof !== expectedProof) {
          const err = new Error("Invalid recovery proof");
          err.code = TwoOfThreeError.INVALID_PROOF;
          throw err;
        }
      }
    }

    pendingRecoveries.delete(key);
    return { type: TwoOfThreeMessageType.RECOVERY_OK, userId, tier: 3 };
  }

  return { handleRecoveryStart, handleRecoveryComplete };
}

/**
 * Create rotation handler
 * @param {Object} ctx - Context with ledger
 * @returns {Object} Rotation handler function
 */
function createRotationHandler(ctx) {
  const { ledger } = ctx;

  /**
   * Handle share rotation
   * @param {Object} params - Parameters
   * @param {string} params.userId - User ID
   * @param {string} params.shareId - Share ID
   * @param {string} params.encryptedShare - Encrypted share data
   * @param {string} params.reason - Rotation reason
   * @returns {Promise<Object>} Rotation result
   */
  async function handleRotation({ userId, shareId, encryptedShare, reason = "rotation" }) {
    if (!Object.values(ShareId).includes(shareId)) {
      const err = new Error(`Invalid share ID: ${shareId}`);
      err.code = TwoOfThreeError.INVALID_FACTOR;
      throw err;
    }

    if (!(await ledger.isEnrolled(userId))) {
      const err = new Error(`User ${userId} is not enrolled`);
      err.code = TwoOfThreeError.NOT_ENROLLED;
      throw err;
    }

    const metadata = await ledger.getShareMetadata(userId, shareId);

    if (shareId === ShareId.S2) {
      const result = await ledger.updateS2Metadata(userId, metadata.version + 1);
      return { type: TwoOfThreeMessageType.ROTATION_OK, shareId, oldVersion: result.oldVersion, newVersion: result.newVersion };
    }

    const result = await ledger.rotateShare(userId, shareId, { factor: metadata.factor, data: Buffer.from(encryptedShare, "base64") }, reason);
    return { type: TwoOfThreeMessageType.ROTATION_OK, shareId, oldVersion: result.oldVersion, newVersion: result.newVersion };
  }

  return { handleRotation };
}

module.exports = { createEnrollmentHandlers, createRecoveryHandlers, createRotationHandler };
