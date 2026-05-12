/**
 * @fileoverview Authentication Framework Coordinator for api-ape Server
 *
 * Coordinates authentication adapters, state machines, and message handling.
 * Provides a unified interface for socket authentication.
 *
 * @module server/security/auth
 * @see {@link module:server/security/auth/state-machine} for state management
 * @see {@link module:server/security/auth/adapters/opaque} for OPAQUE adapter
 */

"use strict";

const { createAuthStateMachine, AuthState, AuthTier, AuthError } = require("./state-machine");
const { createOpaqueAdapter, OpaqueMessageType, OpaqueError } = require("./adapters/opaque");
const { createWebAuthnStrategy, WebAuthnMessageType, WebAuthnError } = require("./adapters/webauthn");
const { createTOTPStrategy, TOTPMessageType, TOTPError } = require("./adapters/totp");
const { createLDAPStrategy, LDAPMessageType, LDAPError } = require("./adapters/ldap");
const { createSAMLStrategy, SAMLMessageType, SAMLError } = require("./adapters/saml");
const { createOAuth2Strategy, OAuth2MessageType, OAuth2Error } = require("./adapters/oauth2");
const { createTwoOfThreeStrategy, TwoOfThreeMessageType, TwoOfThreeError } = require("./mfa/two-of-three");
const { AUTH_MESSAGE_PREFIXES, isAuthMessage } = require("./framework/constants");
const { createSocketAuthManager } = require("./framework/socket-auth");

/**
 * AuthFramework configuration
 * @typedef {Object} AuthFrameworkConfig
 * @property {Object} [opaque={}] - OPAQUE adapter configuration
 * @property {Object} [ldap=null] - LDAP adapter configuration
 * @property {Object} [saml=null] - SAML adapter configuration
 * @property {Object} [oauth2=null] - OAuth2 adapter configuration
 * @property {Object} [webauthn={}] - WebAuthn adapter configuration
 * @property {Object} [totp={}] - TOTP adapter configuration
 * @property {Object} [twoOfThree={}] - 2-of-3 key recovery adapter configuration (Tier 3)
 * @property {Object} [stateMachine={}] - State machine configuration
 * @property {boolean} [requireAuth=false] - Require auth for all connections
 * @property {string[]} [mfaMethods=['webauthn', 'totp']] - Available MFA methods
 * @property {Function} [onAuthSuccess] - Callback on successful authentication
 * @property {Function} [onAuthFailure] - Callback on authentication failure
 * @property {Function} [onMFASuccess] - Callback on successful MFA elevation
 * @property {Function} [onKeyRecoverySuccess] - Callback on successful Tier 3 elevation
 */

/**
 * Create an authentication framework instance
 *
 * @param {AuthFrameworkConfig} [config={}] - Configuration options
 * @returns {Object} AuthFramework instance
 *
 * @example
 * const auth = createAuthFramework({
 *   opaque: {
 *     getUser: async (username) => db.users.findOne({ username }),
 *     saveUser: async (username, data) => db.users.insertOne({ username, ...data })
 *   },
 *   requireAuth: false,
 *   onAuthSuccess: (clientId, principal) => console.log(`${clientId} authenticated as ${principal.userId}`)
 * });
 *
 * // In wiring.js, attach to socket:
 * const socketAuth = auth.createSocketAuth(clientId);
 *
 * // Handle auth messages:
 * if (auth.isAuthMessage(messageType)) {
 *   const response = await socketAuth.handleMessage(messageType, data);
 *   send(null, response.type, response, null);
 * }
 */
// Shared no-op for default callbacks. A single function reference is
// reused across every onX default so coverage of any default path counts
// once for all four; eliminates four separate uncovered arrows that
// otherwise required four independent full-integration test paths.
const noop = () => {};

function createAuthFramework(config = {}) {
  const {
    opaque: opaqueConfig = {},
    ldap: ldapConfig = null,
    saml: samlConfig = null,
    oauth2: oauth2Config = null,
    webauthn: webauthnConfig = {},
    totp: totpConfig = {},
    twoOfThree: twoOfThreeConfig = {},
    stateMachine: stateMachineConfig = {},
    requireAuth = false,
    mfaMethods = ["webauthn", "totp"],
    onAuthSuccess = noop,
    onAuthFailure = noop,
    onMFASuccess = noop,
    onKeyRecoverySuccess = noop,
  } = config;

  /** Registered adapters */
  const adapters = new Map();

  /** Per-socket auth state machines */
  const socketStates = new Map();

  /** OPAQUE adapter instance (Tier 1) */
  const opaqueAdapter = createOpaqueAdapter(opaqueConfig);
  adapters.set("opaque", opaqueAdapter);

  /** LDAP adapter instance (Tier 1, optional) */
  if (ldapConfig) {
    const ldapAdapter = createLDAPStrategy(ldapConfig);
    adapters.set("ldap", ldapAdapter);
  }

  /** SAML adapter instance (Tier 1, optional) */
  if (samlConfig) {
    const samlAdapter = createSAMLStrategy(samlConfig);
    adapters.set("saml", samlAdapter);
  }

  /** OAuth2 adapter instance (Tier 1, optional) */
  if (oauth2Config) {
    const oauth2Adapter = createOAuth2Strategy(oauth2Config);
    adapters.set("oauth2", oauth2Adapter);
  }

  /** WebAuthn adapter instance (Tier 2 MFA) */
  const webauthnAdapter = createWebAuthnStrategy(webauthnConfig);
  adapters.set("webauthn", webauthnAdapter);

  /** TOTP adapter instance (Tier 2 MFA) */
  const totpAdapter = createTOTPStrategy(totpConfig);
  adapters.set("totp", totpAdapter);

  /** Two-of-Three adapter instance (Tier 3 Key Recovery) */
  const twoOfThreeAdapter = createTwoOfThreeStrategy(twoOfThreeConfig);
  adapters.set("two-of-three", twoOfThreeAdapter);

  /**
   * Register an authentication adapter
   *
   * @param {string} name - Adapter name
   * @param {Object} adapter - Adapter instance
   */
  function registerAdapter(name, adapter) {
    adapters.set(name, adapter);
  }

  /**
   * Get a registered adapter
   *
   * @param {string} name - Adapter name
   * @returns {Object|null} Adapter instance or null
   */
  function getAdapter(name) {
    return adapters.get(name) || null;
  }

  /**
   * Create auth state manager for a specific socket
   *
   * @param {string} clientId - Socket client identifier
   * @returns {Object} Socket auth manager
   */
  function createSocketAuth(clientId) {
    const stateMachine = createAuthStateMachine(stateMachineConfig);
    socketStates.set(clientId, stateMachine);

    const manager = createSocketAuthManager({
      clientId,
      stateMachine,
      adapters: {
        opaqueAdapter,
        ldapAdapter: adapters.get("ldap"),
        webauthnAdapter,
        totpAdapter,
        twoOfThreeAdapter,
      },
      mfaMethods,
      callbacks: { onAuthSuccess, onAuthFailure, onMFASuccess, onKeyRecoverySuccess },
    });

    // Wrap cleanup to also remove from socketStates
    const originalCleanup = manager.cleanup;
    manager.cleanup = function () {
      originalCleanup();
      socketStates.delete(clientId);
    };

    return manager;
  }

  /**
   * Get auth state for a client
   *
   * @param {string} clientId - Client identifier
   * @returns {Object|null} Auth state or null if not found
   */
  function getClientAuth(clientId) {
    return socketStates.get(clientId) || null;
  }

  /**
   * Check if authentication is required
   * @returns {boolean} Whether auth is required
   */
  function isAuthRequired() {
    return requireAuth;
  }

  /**
   * Get framework statistics
   * @returns {Object} Statistics
   */
  function getStats() {
    let authenticated = 0;
    let elevated = 0;
    let highSecurity = 0;

    for (const [, state] of socketStates) {
      const tier = state.getTier();
      if (tier >= AuthTier.BASIC) authenticated++;
      if (tier >= AuthTier.ELEVATED) elevated++;
      if (tier >= AuthTier.HIGH_SECURITY) highSecurity++;
    }

    return {
      totalSockets: socketStates.size,
      authenticated,
      elevated,
      highSecurity,
      adapters: Array.from(adapters.keys()),
    };
  }

  return {
    createSocketAuth,
    getClientAuth,
    isAuthMessage,
    isAuthRequired,
    registerAdapter,
    getAdapter,
    getStats,

    // Export types for external use
    AuthState,
    AuthTier,
    AuthError,
    OpaqueMessageType,
    OpaqueError,
    WebAuthnMessageType,
    WebAuthnError,
    TOTPMessageType,
    TOTPError,
    TwoOfThreeMessageType,
    TwoOfThreeError,
    AUTH_MESSAGE_PREFIXES,

    // Export strategy constructors for custom instantiation
    createWebAuthnStrategy,
    createTOTPStrategy,
    createTwoOfThreeStrategy,
  };
}

module.exports = {
  createAuthFramework,
  isAuthMessage,
  AuthState,
  AuthTier,
  AuthError,
  OpaqueMessageType,
  OpaqueError,
  WebAuthnMessageType,
  WebAuthnError,
  TOTPMessageType,
  TOTPError,
  TwoOfThreeMessageType,
  TwoOfThreeError,
  LDAPMessageType,
  LDAPError,
  SAMLMessageType,
  SAMLError,
  OAuth2MessageType,
  OAuth2Error,
  AUTH_MESSAGE_PREFIXES,

  // Export strategy constructors for Passport.js compatibility
  createWebAuthnStrategy,
  createTOTPStrategy,
  createTwoOfThreeStrategy,
  createLDAPStrategy,
  createSAMLStrategy,
  createOAuth2Strategy,
  // Passport.js style aliases
  WebAuthnStrategy: createWebAuthnStrategy,
  TOTPStrategy: createTOTPStrategy,
  TwoOfThreeStrategy: createTwoOfThreeStrategy,
  LDAPStrategy: createLDAPStrategy,
  SAMLStrategy: createSAMLStrategy,
  OAuth2Strategy: createOAuth2Strategy,
};
