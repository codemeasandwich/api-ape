/**
 * @fileoverview Authentication Message Handlers for api-ape Server
 *
 * Routes incoming authentication messages to the appropriate handler
 * in the auth framework.
 *
 * @module server/security/auth/handlers/auth-messages
 * @see {@link module:server/security/auth} for the auth framework
 */

const { apeLog } = require("../../../../utils/apeLogger");
const { isAuthMessage, OpaqueMessageType, WebAuthnMessageType, TOTPMessageType } = require("../index");

/**
 * Create a handler function that processes auth messages
 *
 * @param {Object} socketAuth - Socket auth manager from createSocketAuth
 * @param {Function} send - Send function for this socket
 * @returns {Function} Message handler function
 *
 * @example
 * const socketAuth = authFramework.createSocketAuth(clientId);
 * const authHandler = createAuthMessageHandler(socketAuth, send);
 *
 * // In message receive:
 * if (isAuthMessage(type)) {
 *   await authHandler(type, data);
 *   return; // Don't route to controllers
 * }
 */
function createAuthMessageHandler(socketAuth, send) {
  /**
   * Handle an authentication message
   *
   * @param {string} queryId - Message query ID
   * @param {string} type - Message type
   * @param {Object} data - Message data
   * @returns {Promise<boolean>} True if message was handled
   */
  async function handleAuthMessage(queryId, type, data) {
    if (!isAuthMessage(type)) {
      return false;
    }

    try {
      const response = await socketAuth.handleMessage(type, data);

      try {
        send(queryId, response.type, response, null);
      } catch (sendErr) {
        apeLog.error("Failed to send auth response:", sendErr.message);
      }

      return true;
    } catch (err) {
      const errorResponse = {
        type: `${type}_error`,
        error: err.code || "AUTH_ERROR",
        message: err.message,
      };

      try {
        send(queryId, errorResponse.type, errorResponse, err);
      } catch (sendErr) {
        apeLog.error("Failed to send auth error:", sendErr.message);
      }

      return true;
    }
  }

  return handleAuthMessage;
}

/**
 * Auth message type descriptions for logging/debugging
 * @type {Object<string, string>}
 */
const AUTH_MESSAGE_DESCRIPTIONS = {
  // OPAQUE (Tier 1)
  [OpaqueMessageType.REG_START]: "OPAQUE registration start",
  [OpaqueMessageType.REG_RESPONSE]: "OPAQUE registration response",
  [OpaqueMessageType.REG_FINISH]: "OPAQUE registration finish",
  [OpaqueMessageType.REG_OK]: "OPAQUE registration complete",
  [OpaqueMessageType.REG_FAIL]: "OPAQUE registration failed",
  [OpaqueMessageType.AUTH_START]: "OPAQUE authentication start",
  [OpaqueMessageType.AUTH_1]: "OPAQUE authentication challenge",
  [OpaqueMessageType.AUTH_2]: "OPAQUE authentication proof",
  [OpaqueMessageType.AUTH_OK]: "OPAQUE authentication success",
  [OpaqueMessageType.AUTH_FAIL]: "OPAQUE authentication failed",

  // WebAuthn (Tier 2 MFA)
  [WebAuthnMessageType.REG_START]: "WebAuthn registration start",
  [WebAuthnMessageType.REG_CHALLENGE]: "WebAuthn registration challenge",
  [WebAuthnMessageType.REG_FINISH]: "WebAuthn registration finish",
  [WebAuthnMessageType.REG_OK]: "WebAuthn registration complete",
  [WebAuthnMessageType.REG_FAIL]: "WebAuthn registration failed",
  [WebAuthnMessageType.AUTH_START]: "WebAuthn authentication start",
  [WebAuthnMessageType.AUTH_CHALLENGE]: "WebAuthn authentication challenge",
  [WebAuthnMessageType.AUTH_FINISH]: "WebAuthn authentication finish",
  [WebAuthnMessageType.AUTH_OK]: "WebAuthn authentication success",
  [WebAuthnMessageType.AUTH_FAIL]: "WebAuthn authentication failed",

  // TOTP (Tier 2 MFA)
  [TOTPMessageType.SETUP_START]: "TOTP setup start",
  [TOTPMessageType.SETUP_CHALLENGE]: "TOTP setup challenge",
  [TOTPMessageType.SETUP_VERIFY]: "TOTP setup verify",
  [TOTPMessageType.SETUP_OK]: "TOTP setup complete",
  [TOTPMessageType.SETUP_FAIL]: "TOTP setup failed",
  [TOTPMessageType.VERIFY]: "TOTP verification",
  [TOTPMessageType.OK]: "TOTP verification success",
  [TOTPMessageType.FAIL]: "TOTP verification failed",
  [TOTPMessageType.DISABLE_START]: "TOTP disable",
  [TOTPMessageType.DISABLE_OK]: "TOTP disabled",

  // Generic MFA
  mfa_challenge: "MFA challenge issued",
  mfa_verify: "MFA verification attempt",
  mfa_elevated: "MFA elevation complete",
  mfa_challenge_fail: "MFA challenge failed",
  mfa_verify_fail: "MFA verification failed",

  // Key Recovery (Tier 3)
  key_recovery_start: "Key recovery initiated",
  key_recovery_shares: "Key recovery shares provided",
  key_recovery_complete: "Key recovery complete",
  key_recovery_ok: "Key recovery success",
};

/**
 * Get human-readable description for an auth message type
 *
 * @param {string} type - Message type
 * @returns {string} Description
 */
function getMessageDescription(type) {
  return AUTH_MESSAGE_DESCRIPTIONS[type] || `Auth message: ${type}`;
}

module.exports = {
  createAuthMessageHandler,
  getMessageDescription,
  AUTH_MESSAGE_DESCRIPTIONS,
};
