/**
 * @fileoverview Auth Framework Message Handlers
 * @module server/security/auth/framework/handlers
 */

"use strict";

const { OpaqueMessageType } = require("../adapters/opaque");
const { WebAuthnMessageType } = require("../adapters/webauthn");
const { TOTPMessageType } = require("../adapters/totp");
const { LDAPMessageType } = require("../adapters/ldap");
const { TwoOfThreeMessageType } = require("../mfa/two-of-three");
const { AuthState, AuthTier } = require("../state-machine");

/**
 * Create OPAQUE handlers
 * @param {Object} opaqueAdapter - OPAQUE adapter instance
 * @param {Object} stateMachine - Auth state machine
 * @param {string} clientId - Client ID
 * @param {Object} callbacks - Callback functions
 * @returns {Object} OPAQUE handler functions
 */
function createOpaqueHandlers(opaqueAdapter, stateMachine, clientId, callbacks) {
  const { onAuthSuccess, onAuthFailure } = callbacks;

  return {
    /** @param {Object} data - Registration data @returns {Promise<Object>} Registration response */
    async handleRegStart(data) {
      return await opaqueAdapter.handleRegStart({ clientId, user: data.user, clientNonce: data.clientNonce, regRequest: data.regRequest });
    },
    /** @param {Object} data - Registration data @returns {Promise<Object>} Registration response */
    async handleRegFinish(data) {
      return await opaqueAdapter.handleRegFinish({ clientId, user: data.user, clientNonce: data.clientNonce, regRecord: data.regRecord });
    },
    /** @param {Object} data - Auth data @returns {Promise<Object>} Auth response */
    async handleAuthStart(data) {
      stateMachine.startAuth("opaque");
      return await opaqueAdapter.handleAuthStart({ clientId, user: data.user, clientNonce: data.clientNonce });
    },
    /** @param {Object} data - Auth data @returns {Promise<Object>} Auth response */
    async handleAuth2(data) {
      const response = await opaqueAdapter.handleAuthFinish({ clientId, user: data.user, clientNonce: data.clientNonce, clientAuth: data.clientAuth });
      const authResult = stateMachine.completeAuth(response.assignedPrincipal);
      onAuthSuccess(clientId, authResult.principal);
      return { ...response, state: authResult.state, tier: authResult.tier };
    },
  };
}

/**
 * Create LDAP handlers
 * @param {Object} ldapAdapter - LDAP adapter instance
 * @param {Object} stateMachine - Auth state machine
 * @param {string} clientId - Client ID
 * @param {Object} callbacks - Callback functions
 * @returns {Object} LDAP handler functions
 */
function createLDAPHandlers(ldapAdapter, stateMachine, clientId, callbacks) {
  const { onAuthSuccess, onAuthFailure } = callbacks;

  return {
    /** @param {Object} data - Auth data @returns {Promise<Object>} Auth response */
    async handleAuth(data) {
      if (!ldapAdapter) {
        return { type: LDAPMessageType.AUTH_FAIL, error: "LDAP_NOT_CONFIGURED", message: "LDAP authentication is not enabled" };
      }
      stateMachine.startAuth("ldap");
      const response = await ldapAdapter.handleAuth({ username: data.username, password: data.password });
      if (response.type === LDAPMessageType.AUTH_FAIL) {
        try { onAuthFailure(clientId, new Error(response.message), data); } catch (e) {}
        return response;
      }
      const principal = { userId: response.userId, displayName: response.profile?.displayName, email: response.profile?.email, groups: response.groups || [], source: "ldap" };
      const authResult = stateMachine.completeAuth(principal);
      onAuthSuccess(clientId, authResult.principal);
      return { type: LDAPMessageType.AUTH_OK, userId: response.userId, profile: response.profile, state: authResult.state, tier: authResult.tier };
    },
  };
}

/**
 * Create MFA handlers
 * @param {Object} adapters - MFA adapters (webauthn, totp)
 * @param {Object} stateMachine - Auth state machine
 * @param {string} clientId - Client ID
 * @param {string[]} mfaMethods - Enabled MFA methods
 * @param {Object} callbacks - Callback functions
 * @returns {Object} MFA handler functions
 */
function createMFAHandlers(adapters, stateMachine, clientId, mfaMethods, callbacks) {
  const { webauthnAdapter, totpAdapter } = adapters;
  const { onMFASuccess } = callbacks;

  return {
    /** @param {Object} state - Auth state @returns {Promise<Object>} MFA challenge */
    async handleChallenge(state) {
      const availableMethods = [];
      const userId = state.principal?.userId;
      if (mfaMethods.includes("webauthn")) {
        try {
          const creds = await webauthnAdapter.handleAuthStart({ clientId, userId });
          availableMethods.push({ method: "webauthn", challenge: creds });
        } catch (e) {}
      }
      if (mfaMethods.includes("totp") && await totpAdapter.isEnabled(userId)) {
        availableMethods.push({ method: "totp" });
      }
      if (availableMethods.length === 0) {
        return { type: "mfa_challenge_fail", error: "NO_MFA_METHODS", message: "No MFA methods configured for this user" };
      }
      stateMachine.startMFA(availableMethods.map((m) => m.method));
      return { type: "mfa_challenge", methods: availableMethods };
    },
    /** @param {Object} data - Verify data @param {Object} state - Auth state @returns {Promise<Object>} MFA result */
    async handleVerify(data, state) {
      const { method, ...verifyData } = data;
      if (method === "webauthn") {
        await webauthnAdapter.handleAuthFinish({ clientId, userId: state.principal?.userId, challenge: verifyData.challenge, assertion: verifyData.assertion });
        const mfaResult = stateMachine.completeMFA("webauthn");
        onMFASuccess(clientId, mfaResult.principal, "webauthn");
        return { type: "mfa_elevated", method: "webauthn", tier: mfaResult.tier, state: mfaResult.state };
      }
      if (method === "totp") {
        await totpAdapter.handleVerify({ clientId, userId: state.principal?.userId, code: verifyData.code });
        const mfaResult = stateMachine.completeMFA("totp");
        onMFASuccess(clientId, mfaResult.principal, "totp");
        return { type: "mfa_elevated", method: "totp", tier: mfaResult.tier, state: mfaResult.state };
      }
      return { type: "mfa_verify_fail", error: "UNKNOWN_MFA_METHOD", message: `Unknown MFA method: ${method}` };
    },
  };
}

/**
 * Create WebAuthn handlers
 * @param {Object} webauthnAdapter - WebAuthn adapter instance
 * @param {Object} stateMachine - Auth state machine
 * @param {string} clientId - Client ID
 * @param {Object} callbacks - Callback functions
 * @returns {Object} WebAuthn handler functions
 */
function createWebAuthnHandlers(webauthnAdapter, stateMachine, clientId, callbacks) {
  const { onMFASuccess } = callbacks;

  return {
    /** @param {Object} data - Reg data @param {Object} state - Auth state @returns {Promise<Object>} Reg response */
    async handleRegStart(data, state) {
      return await webauthnAdapter.handleRegStart({ clientId, userId: data.userId || state.principal?.userId, userName: data.userName, userDisplayName: data.userDisplayName });
    },
    /** @param {Object} data - Reg data @param {Object} state - Auth state @returns {Promise<Object>} Reg response */
    async handleRegFinish(data, state) {
      return await webauthnAdapter.handleRegFinish({ clientId, userId: data.userId || state.principal?.userId, challenge: data.challenge, attestation: data.attestation });
    },
    /** @param {Object} data - Auth data @param {Object} state - Auth state @returns {Promise<Object>} Auth response */
    async handleAuthStart(data, state) {
      return await webauthnAdapter.handleAuthStart({ clientId, userId: data.userId || state.principal?.userId });
    },
    /** @param {Object} data - Auth data @param {Object} state - Auth state @returns {Promise<Object>} Auth response */
    async handleAuthFinish(data, state) {
      const result = await webauthnAdapter.handleAuthFinish({ clientId, userId: data.userId || state.principal?.userId, challenge: data.challenge, assertion: data.assertion });
      if (state.tier >= AuthTier.BASIC && state.state === AuthState.AUTHENTICATED) {
        stateMachine.startMFA(["webauthn"]);
        const mfaResult = stateMachine.completeMFA("webauthn");
        onMFASuccess(clientId, mfaResult.principal, "webauthn");
        return { ...result, tier: mfaResult.tier, state: mfaResult.state };
      }
      return result;
    },
  };
}

/**
 * Create TOTP handlers
 * @param {Object} totpAdapter - TOTP adapter instance
 * @param {Object} stateMachine - Auth state machine
 * @param {string} clientId - Client ID
 * @param {Object} callbacks - Callback functions
 * @returns {Object} TOTP handler functions
 */
function createTOTPHandlers(totpAdapter, stateMachine, clientId, callbacks) {
  const { onMFASuccess } = callbacks;

  return {
    /** @param {Object} data - Setup data @param {Object} state - Auth state @returns {Promise<Object>} Setup response */
    async handleSetupStart(data, state) {
      return await totpAdapter.handleSetupStart({ clientId, userId: data.userId || state.principal?.userId, accountName: data.accountName });
    },
    /** @param {Object} data - Verify data @param {Object} state - Auth state @returns {Promise<Object>} Verify response */
    async handleSetupVerify(data, state) {
      return await totpAdapter.handleSetupVerify({ clientId, userId: data.userId || state.principal?.userId, code: data.code });
    },
    /** @param {Object} data - Verify data @param {Object} state - Auth state @returns {Promise<Object>} Verify response */
    async handleVerify(data, state) {
      const result = await totpAdapter.handleVerify({ clientId, userId: data.userId || state.principal?.userId, code: data.code });
      if (state.tier >= AuthTier.BASIC && state.state === AuthState.AUTHENTICATED) {
        stateMachine.startMFA(["totp"]);
        const mfaResult = stateMachine.completeMFA("totp");
        onMFASuccess(clientId, mfaResult.principal, "totp");
        return { ...result, tier: mfaResult.tier, state: mfaResult.state };
      }
      return result;
    },
    /** @param {Object} data - Disable data @param {Object} state - Auth state @returns {Promise<Object>} Disable response */
    async handleDisable(data, state) {
      return await totpAdapter.handleDisable({ clientId, userId: data.userId || state.principal?.userId, code: data.code });
    },
  };
}

/**
 * Create Key Recovery handlers
 * @param {Object} twoOfThreeAdapter - Two-of-three adapter instance
 * @param {Object} stateMachine - Auth state machine
 * @param {string} clientId - Client ID
 * @param {Object} callbacks - Callback functions
 * @returns {Object} Key recovery handler functions
 */
function createKeyRecoveryHandlers(twoOfThreeAdapter, stateMachine, clientId, callbacks) {
  const { onKeyRecoverySuccess } = callbacks;

  return {
    /** @param {Object} state - Auth state @returns {Promise<Object>} Enrollment response */
    async handleEnrollmentStart(state) {
      return await twoOfThreeAdapter.handleEnrollmentStart({ clientId, userId: state.principal?.userId });
    },
    /** @param {Object} data - Enrollment data @param {Object} state - Auth state @returns {Promise<Object>} Enrollment response */
    async handleEnrollmentFinish(data, state) {
      return await twoOfThreeAdapter.handleEnrollmentFinish({ clientId, userId: data.userId || state.principal?.userId, encShares: data.encShares, shareIndices: data.shareIndices, proof: data.proof });
    },
    /** @param {Object} data - Recovery data @param {Object} state - Auth state @returns {Promise<Object>} Recovery response */
    async handleRecoveryStart(data, state) {
      const recoveryInfo = stateMachine.startKeyRecovery({ factors: data.factors || ['oauth', 'webauthn', 'totp'] });
      const response = await twoOfThreeAdapter.handleRecoveryStart({ clientId, userId: data.userId || state.principal?.userId, factors: data.factors });
      return { ...response, challenge: recoveryInfo.challenge, state: recoveryInfo.state };
    },
    /** @param {Object} data - Recovery data @param {Object} state - Auth state @returns {Promise<Object>} Recovery response */
    async handleRecoveryComplete(data, state) {
      const response = await twoOfThreeAdapter.handleRecoveryComplete({ clientId, userId: data.userId || state.principal?.userId, proof: data.proof });
      if (response.type === TwoOfThreeMessageType.RECOVERY_FAIL) return response;
      const result = stateMachine.completeKeyRecovery({ proof: data.proof, usedFactors: data.usedFactors || response.usedFactors || [] });
      onKeyRecoverySuccess(clientId, result.principal, data.usedFactors);
      return { ...response, state: result.state, tier: result.tier };
    },
    /** @param {Object} data - Rotation data @param {Object} state - Auth state @returns {Promise<Object>} Rotation response */
    async handleRotation(data, state) {
      return await twoOfThreeAdapter.handleRotation({ clientId, userId: data.userId || state.principal?.userId, shareId: data.shareId, encShare: data.encShare, reason: data.reason });
    },
    /** @returns {Object} Cancel response */
    handleCancel() {
      try {
        const result = stateMachine.cancelKeyRecovery();
        return { type: "key_recovery_cancelled", state: result.state, tier: result.tier };
      } catch (err) {
        return { type: "key_recovery_cancel_fail", error: err.code || "CANCEL_FAILED", message: err.message };
      }
    },
    /** @returns {Object} Status response */
    handleStatus() {
      const status = stateMachine.getKeyRecoveryStatus();
      return { type: "key_recovery_status", pending: status !== null, ...status };
    },
  };
}

module.exports = {
  createOpaqueHandlers,
  createLDAPHandlers,
  createMFAHandlers,
  createWebAuthnHandlers,
  createTOTPHandlers,
  createKeyRecoveryHandlers,
};
