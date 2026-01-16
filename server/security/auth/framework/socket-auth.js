/**
 * @fileoverview Socket Auth Manager
 * @module server/security/auth/framework/socket-auth
 */

"use strict";

const { OpaqueMessageType } = require("../adapters/opaque");
const { WebAuthnMessageType } = require("../adapters/webauthn");
const { TOTPMessageType } = require("../adapters/totp");
const { LDAPMessageType } = require("../adapters/ldap");
const { TwoOfThreeMessageType } = require("../mfa/two-of-three");
const { AuthTier } = require("../state-machine");
const {
  createOpaqueHandlers,
  createLDAPHandlers,
  createMFAHandlers,
  createWebAuthnHandlers,
  createTOTPHandlers,
  createKeyRecoveryHandlers,
} = require("./handlers");

/**
 * Create socket auth manager
 * @param {Object} config - Configuration object
 * @param {string} config.clientId - Client ID
 * @param {Object} config.stateMachine - Auth state machine
 * @param {Object} config.adapters - Auth adapters
 * @param {string[]} config.mfaMethods - Enabled MFA methods
 * @param {Object} config.callbacks - Callback functions
 * @returns {Object} Socket auth manager
 */
function createSocketAuthManager(config) {
  const {
    clientId,
    stateMachine,
    adapters,
    mfaMethods,
    callbacks,
  } = config;

  const { opaqueAdapter, ldapAdapter, webauthnAdapter, totpAdapter, twoOfThreeAdapter } = adapters;
  const { onAuthSuccess, onAuthFailure } = callbacks;

  const opaqueHandlers = createOpaqueHandlers(opaqueAdapter, stateMachine, clientId, callbacks);
  const ldapHandlers = createLDAPHandlers(ldapAdapter, stateMachine, clientId, callbacks);
  const mfaHandlers = createMFAHandlers({ webauthnAdapter, totpAdapter }, stateMachine, clientId, mfaMethods, callbacks);
  const webauthnHandlers = createWebAuthnHandlers(webauthnAdapter, stateMachine, clientId, callbacks);
  const totpHandlers = createTOTPHandlers(totpAdapter, stateMachine, clientId, callbacks);
  const keyRecoveryHandlers = createKeyRecoveryHandlers(twoOfThreeAdapter, stateMachine, clientId, callbacks);

  /**
   * Handle an incoming auth message
   * @param {string} type - Message type
   * @param {Object} data - Message data
   * @returns {Promise<Object>} Response message
   */
  async function handleMessage(type, data) {
    const state = stateMachine.getState();

    try {
      // OPAQUE
      if (type === OpaqueMessageType.REG_START) return await opaqueHandlers.handleRegStart(data);
      if (type === OpaqueMessageType.REG_FINISH) return await opaqueHandlers.handleRegFinish(data);
      if (type === OpaqueMessageType.AUTH_START) return await opaqueHandlers.handleAuthStart(data);
      if (type === OpaqueMessageType.AUTH_2) return await opaqueHandlers.handleAuth2(data);

      // LDAP
      if (type === LDAPMessageType.AUTH) return await ldapHandlers.handleAuth(data);

      // MFA
      if (type === "mfa_challenge") return await mfaHandlers.handleChallenge(state);
      if (type === "mfa_verify") return await mfaHandlers.handleVerify(data, state);

      // WebAuthn
      if (type === WebAuthnMessageType.REG_START) return await webauthnHandlers.handleRegStart(data, state);
      if (type === WebAuthnMessageType.REG_FINISH) return await webauthnHandlers.handleRegFinish(data, state);
      if (type === WebAuthnMessageType.AUTH_START) return await webauthnHandlers.handleAuthStart(data, state);
      if (type === WebAuthnMessageType.AUTH_FINISH) return await webauthnHandlers.handleAuthFinish(data, state);

      // TOTP
      if (type === TOTPMessageType.SETUP_START) return await totpHandlers.handleSetupStart(data, state);
      if (type === TOTPMessageType.SETUP_VERIFY) return await totpHandlers.handleSetupVerify(data, state);
      if (type === TOTPMessageType.VERIFY) return await totpHandlers.handleVerify(data, state);
      if (type === TOTPMessageType.DISABLE_START) return await totpHandlers.handleDisable(data, state);

      // Key Recovery
      if (type === TwoOfThreeMessageType.ENROLLMENT_START) return await keyRecoveryHandlers.handleEnrollmentStart(state);
      if (type === TwoOfThreeMessageType.ENROLLMENT_FINISH) return await keyRecoveryHandlers.handleEnrollmentFinish(data, state);
      if (type === TwoOfThreeMessageType.RECOVERY_START) return await keyRecoveryHandlers.handleRecoveryStart(data, state);
      if (type === TwoOfThreeMessageType.RECOVERY_COMPLETE) return await keyRecoveryHandlers.handleRecoveryComplete(data, state);
      if (type === TwoOfThreeMessageType.ROTATION_START) return await keyRecoveryHandlers.handleRotation(data, state);
      if (type === "key_recovery_cancel") return keyRecoveryHandlers.handleCancel();
      if (type === "key_recovery_status") return keyRecoveryHandlers.handleStatus();

      return { type: "auth_error", error: "UNKNOWN_MESSAGE_TYPE", message: `Unknown auth message type: ${type}` };
    } catch (err) {
      if (type === OpaqueMessageType.AUTH_START || type === OpaqueMessageType.AUTH_2) {
        const failResult = stateMachine.failAuth(err.code || "AUTH_ERROR");
        onAuthFailure(clientId, err, failResult);
      }
      return { type: type.replace(/_start$|_2$/, "_fail"), error: err.code || "AUTH_ERROR", message: err.message, attempts: stateMachine.getState().attempts };
    }
  }

  /**
   * Get current auth state
   * @returns {Object} Auth state
   */
  function getState() {
    return stateMachine.getState();
  }

  /**
   * Get current auth tier
   * @returns {number} Auth tier
   */
  function getTier() {
    return stateMachine.getTier();
  }

  /**
   * Check if client is authenticated
   * @returns {boolean} True if authenticated
   */
  function isAuthenticated() {
    return stateMachine.getTier() >= AuthTier.BASIC;
  }

  /**
   * Check if client meets required tier
   * @param {number} requiredTier - Required auth tier
   * @returns {boolean} True if requirement met
   */
  function meetsRequirement(requiredTier) {
    return stateMachine.getTier() >= requiredTier;
  }

  /**
   * Authorize an action
   * @param {string} action - Action to authorize
   * @param {Object} context - Authorization context
   * @returns {Object} Authorization result
   */
  function authorize(action, context = {}) {
    const state = stateMachine.getState();
    if (!state.isAuthenticated) {
      return { allowed: false, reason: "NOT_AUTHENTICATED", requiredTier: AuthTier.BASIC, currentTier: state.tier };
    }
    return { allowed: true, principal: state.principal, tier: state.tier };
  }

  /**
   * Clean up client resources
   * @returns {void}
   */
  function cleanup() {
    stateMachine.cleanup();
    opaqueAdapter.cleanupClient(clientId);
    webauthnAdapter.cleanupClient(clientId);
    totpAdapter.cleanupClient(clientId);
    if (twoOfThreeAdapter.cleanupClient) twoOfThreeAdapter.cleanupClient(clientId);
  }

  return {
    handleMessage,
    getState,
    getTier,
    isAuthenticated,
    meetsRequirement,
    authorize,
    cleanup,
    stateMachine,
  };
}

module.exports = { createSocketAuthManager };
