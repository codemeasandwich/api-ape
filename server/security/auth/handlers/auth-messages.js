/**
 * @fileoverview Authentication Message Handlers for api-ape Server
 *
 * Routes incoming authentication messages to the appropriate handler
 * in the auth framework.
 *
 * @module server/security/auth/handlers/auth-messages
 * @see {@link module:server/security/auth} for the auth framework
 */

const { isAuthMessage, OpaqueMessageType } = require("../index");

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
        console.error("📢 Failed to send auth response:", sendErr.message);
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
        console.error("📢 Failed to send auth error:", sendErr.message);
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
  mfa_challenge: "MFA challenge issued",
  mfa_verify: "MFA verification attempt",
  mfa_elevated: "MFA elevation complete",
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
