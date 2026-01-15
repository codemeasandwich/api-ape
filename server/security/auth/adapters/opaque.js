/**
 * @fileoverview OPAQUE Authentication Adapter for api-ape Server
 *
 * Implements OPAQUE (Oblivious Pseudo-Random Function based Asymmetric
 * Password-Authenticated Key Exchange) for secure authentication where
 * the server never learns the user's password.
 *
 * ## Protocol Flow (Registration)
 *
 * ```
 * Client                           Server
 *   |-- opaque_reg_start -------->|  (user, clientNonce, regRequest)
 *   |<- opaque_reg_response ------|  (serverNonce, ts, regResponse)
 *   |-- opaque_reg_finish ------->|  (regRecord)
 *   |<- opaque_reg_ok ------------|  (success)
 * ```
 *
 * ## Protocol Flow (Login)
 *
 * ```
 * Client                           Server
 *   |-- opaque_auth_start ------->|  (user, clientNonce)
 *   |<- opaque_auth_1 ------------|  (serverNonce, ts, envelope, oprfResponse)
 *   |-- opaque_auth_2 ----------->|  (clientAuth)
 *   |<- opaque_auth_ok -----------|  (assignedPrincipal, serverProof, authMeta)
 * ```
 *
 * @module server/security/auth/adapters/opaque
 * @see {@link module:server/security/auth/state-machine} for auth state management
 */

const crypto = require("crypto");

/**
 * OPAQUE adapter configuration
 * @typedef {Object} OpaqueConfig
 * @property {Function} [getUser] - Async function to fetch user by username
 * @property {Function} [saveUser] - Async function to save user registration
 * @property {Function} [opaqueLib] - OPAQUE library instance (e.g., @cloudflare/opaque)
 * @property {number} [nonceLength=32] - Server nonce length in bytes
 * @property {number} [nonceExpiry=30000] - Nonce expiry in ms
 * @property {string} [serverId] - Server identifier for OPAQUE context
 */

/**
 * OPAQUE message types
 * @enum {string}
 */
const OpaqueMessageType = {
  REG_START: "opaque_reg_start",
  REG_RESPONSE: "opaque_reg_response",
  REG_FINISH: "opaque_reg_finish",
  REG_OK: "opaque_reg_ok",
  REG_FAIL: "opaque_reg_fail",
  AUTH_START: "opaque_auth_start",
  AUTH_1: "opaque_auth_1",
  AUTH_2: "opaque_auth_2",
  AUTH_OK: "opaque_auth_ok",
  AUTH_FAIL: "opaque_auth_fail",
};

/**
 * OPAQUE error codes
 * @enum {string}
 */
const OpaqueError = {
  USER_NOT_FOUND: "USER_NOT_FOUND",
  USER_EXISTS: "USER_EXISTS",
  INVALID_PROOF: "INVALID_PROOF",
  INVALID_STATE: "INVALID_STATE",
  NONCE_EXPIRED: "NONCE_EXPIRED",
  NONCE_MISMATCH: "NONCE_MISMATCH",
  MISSING_LIB: "MISSING_LIB",
  INVALID_MESSAGE: "INVALID_MESSAGE",
};

/** @private */
const _defaultUserStore = new Map();

/** @private */
const defaultStorage = {
  /**
   * @param {string} username
   * @returns {Promise<Object|null>}
   */
  async getUser(username) {
    return _defaultUserStore.get(username) || null;
  },
  /**
   * @param {string} username
   * @param {Object} userData
   * @returns {Promise<boolean>}
   */
  async saveUser(username, userData) {
    _defaultUserStore.set(username, userData);
    return true;
  },
};

/**
 * Create an OPAQUE adapter instance
 *
 * @param {OpaqueConfig} [config={}] - Configuration options
 * @returns {Object} OPAQUE adapter with registration and authentication methods
 */
function createOpaqueAdapter(config = {}) {
  const {
    getUser = defaultStorage.getUser,
    saveUser = defaultStorage.saveUser,
    opaqueLib = null,
    nonceLength = 32,
    nonceExpiry = 30000,
    serverId = "api-ape-opaque-server",
  } = config;

  const pendingSessions = new Map();

  /**
   * Generate a session key for tracking pending auth
   * @param {string} clientId - Client identifier
   * @param {string} user - Username
   * @returns {string} Session key
   * @private
   */
  function sessionKey(clientId, user) {
    return `${clientId}:${user}`;
  }

  /**
   * Generate a server nonce
   * @returns {Object} Nonce info { nonce, expiresAt }
   * @private
   */
  function generateNonce() {
    const nonce = crypto.randomBytes(nonceLength).toString("base64url");
    const expiresAt = Date.now() + nonceExpiry;
    return { nonce, expiresAt };
  }

  /**
   * Create canonical binding string for OPAQUE context
   * @param {Object} params - Binding parameters
   * @returns {string} Canonical binding string
   */
  function createCanonicalBinding({ clientId, clientNonce, serverNonce, user, ts }) {
    return `${clientId}|${clientNonce}|${serverNonce}|${user}|${ts}`;
  }

  const { createOpaqueHandlers } = require("./opaque-handlers");
  const handlers = createOpaqueHandlers({
    getUser,
    saveUser,
    opaqueLib,
    serverId,
    pendingSessions,
    sessionKey,
    generateNonce,
    createCanonicalBinding,
    nonceExpiry,
    OpaqueMessageType,
    OpaqueError,
  });

  /**
   * Clean up pending sessions for a client
   * @param {string} clientId - Client identifier
   */
  function cleanupClient(clientId) {
    for (const [key] of pendingSessions) {
      if (key.startsWith(clientId + ":")) {
        pendingSessions.delete(key);
      }
    }
  }

  /**
   * Check if the adapter has an OPAQUE library configured
   * @returns {boolean} Whether OPAQUE library is available
   */
  function hasOpaqueLib() {
    return opaqueLib !== null;
  }

  return {
    type: "opaque",
    tier: 1,
    MessageType: OpaqueMessageType,
    Error: OpaqueError,
    handleRegStart: handlers.handleRegStart,
    handleRegFinish: handlers.handleRegFinish,
    handleAuthStart: handlers.handleAuthStart,
    handleAuthFinish: handlers.handleAuthFinish,
    cleanupClient,
    hasOpaqueLib,
    createCanonicalBinding,
    _pendingSessions: pendingSessions,
    _defaultUserStore,
  };
}

module.exports = {
  createOpaqueAdapter,
  OpaqueMessageType,
  OpaqueError,
};
