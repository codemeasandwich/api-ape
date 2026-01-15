/**
 * @fileoverview Two-of-Three Authentication Adapter
 *
 * Implements 2-of-3 SSS key recovery for Tier 3 (HIGH_SECURITY).
 * Compatible with Passport.js strategy interface.
 *
 * @module server/security/auth/mfa/two-of-three
 */

"use strict";

const { createLedger } = require("./ledger");
const { TwoOfThreeMessageType, TwoOfThreeError, DEFAULT_CONFIG } = require("./two-of-three/constants");
const { createCleanupExpired } = require("./two-of-three/helpers");
const { createEnrollmentHandlers, createRecoveryHandlers, createRotationHandler } = require("./two-of-three/handlers");

/**
 * Create a Two-of-Three Strategy
 *
 * @param {Object|Function} options - Config or verify callback
 * @param {Function} verify - Verify callback (Passport.js style)
 * @returns {Object} Two-of-three adapter/strategy
 */
function createTwoOfThreeStrategy(options, verify) {
  let config = {};
  let verifyCallback = null;

  if (typeof options === "function") {
    verifyCallback = options;
  } else {
    config = options || {};
    verifyCallback = verify;
  }

  const {
    requiredFactors = DEFAULT_CONFIG.requiredFactors,
    allowedFlows = DEFAULT_CONFIG.allowedFlows,
    enrollmentTimeout = DEFAULT_CONFIG.enrollmentTimeout,
    secretLength = DEFAULT_CONFIG.secretLength,
    passReqToCallback = false,
    getRecord, saveRecord, deleteRecord,
    auditEnabled = true, onAuditEvent,
  } = config;

  const ledger = createLedger({ getRecord, saveRecord, deleteRecord, auditEnabled, onAuditEvent });
  const pendingEnrollments = new Map();
  const pendingRecoveries = new Map();
  const cleanupExpired = createCleanupExpired(pendingEnrollments, pendingRecoveries);

  const ctx = { ledger, pendingEnrollments, pendingRecoveries, enrollmentTimeout, secretLength, cleanupExpired };
  const { handleEnrollmentStart, handleEnrollmentFinish } = createEnrollmentHandlers(ctx);
  const { handleRecoveryStart, handleRecoveryComplete } = createRecoveryHandlers(ctx);
  const { handleRotation } = createRotationHandler(ctx);

  /**
   * Passport.js authenticate method
   * @param {Object} req - Request object with recovery data
   * @param {Object} authOptions - Authentication options
   */
  function authenticate(req, authOptions = {}) {
    const self = this;
    const { userId, factors, proof } = req.body || req;

    if (!factors || Object.keys(factors).length < requiredFactors) {
      return self.fail({ message: `At least ${requiredFactors} factors required`, code: TwoOfThreeError.INSUFFICIENT_FACTORS });
    }

    const factorKeys = Object.keys(factors).sort().join("+");
    const normalizedFlow = factorKeys.toLowerCase();
    if (!allowedFlows.some((f) => f === normalizedFlow || f.split("+").sort().join("+") === normalizedFlow)) {
      return self.fail({ message: `Flow ${normalizedFlow} not allowed`, code: TwoOfThreeError.INVALID_FLOW });
    }

    if (verifyCallback) {
      /**
       * Passport.js verify callback handler
       * @param {Error|null} err - Error if verification failed
       * @param {Object|false} user - User object if verified, false if not
       * @param {Object} info - Additional info about verification
       * @returns {void}
       */
      const verified = (err, user, info) => {
        if (err) return self.error(err);
        if (!user) return self.fail(info);
        return self.success(user, info);
      };

      if (passReqToCallback) return verifyCallback(req, { userId, factors, proof }, verified);
      return verifyCallback({ userId, factors, proof }, verified);
    }

    self.success({ userId, tier: 3 }, { factors: Object.keys(factors) });
  }

  /**
   * Clean up pending operations for a client
   * @param {string} clientId - Client ID
   * @returns {void}
   */
  function cleanupClient(clientId) {
    for (const key of pendingEnrollments.keys()) {
      if (key.startsWith(`${clientId}:`)) pendingEnrollments.delete(key);
    }
    for (const key of pendingRecoveries.keys()) {
      if (key.startsWith(`${clientId}:`)) pendingRecoveries.delete(key);
    }
  }

  return {
    name: "two-of-three",
    authenticate,
    type: "two-of-three",
    tier: 3,
    MessageType: TwoOfThreeMessageType,
    Error: TwoOfThreeError,
    handleEnrollmentStart,
    handleEnrollmentFinish,
    handleRecoveryStart,
    handleRecoveryComplete,
    handleRotation,
    isEnrolled: (userId) => ledger.isEnrolled(userId),
    cleanupClient,
    getShareVersions: (userId) => ledger.getVersions(userId),
    ledger,
    _pendingEnrollments: pendingEnrollments,
    _pendingRecoveries: pendingRecoveries,
  };
}

module.exports = {
  createTwoOfThreeStrategy,
  Strategy: createTwoOfThreeStrategy,
  TwoOfThreeMessageType,
  TwoOfThreeError,
  DEFAULT_CONFIG,
};
