/**
 * @fileoverview Authentication Framework Coordinator for api-ape Server
 *
 * Coordinates authentication adapters, state machines, and message handling.
 * Provides a unified interface for socket authentication.
 *
 * ## Architecture
 *
 * ```
 * ┌────────────────────────────────────────────────────────────────┐
 * │                     AuthFramework                               │
 * │  ┌──────────────────────────────────────────────────────────┐  │
 * │  │  Adapter Registry                                         │  │
 * │  │  - OPAQUE (Tier 1)                                       │  │
 * │  │  - LDAP, SAML, OAuth2 (Tier 1, future)                   │  │
 * │  │  - WebAuthn, TOTP (Tier 2, future)                       │  │
 * │  └──────────────────────────────────────────────────────────┘  │
 * │  ┌──────────────────────────────────────────────────────────┐  │
 * │  │  Per-Socket State Machines                                │  │
 * │  │  - Tracks auth state per clientId                        │  │
 * │  │  - Enforces tier requirements                            │  │
 * │  └──────────────────────────────────────────────────────────┘  │
 * │  ┌──────────────────────────────────────────────────────────┐  │
 * │  │  Message Router                                           │  │
 * │  │  - Routes auth messages to appropriate adapter           │  │
 * │  │  - Handles auth_* message types                          │  │
 * │  └──────────────────────────────────────────────────────────┘  │
 * └────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @module server/security/auth
 * @see {@link module:server/security/auth/state-machine} for state management
 * @see {@link module:server/security/auth/adapters/opaque} for OPAQUE adapter
 */

const { createAuthStateMachine, AuthState, AuthTier, AuthError } = require("./state-machine");
const { createOpaqueAdapter, OpaqueMessageType, OpaqueError } = require("./adapters/opaque");

/**
 * Auth message type prefixes for routing
 * @type {string[]}
 */
const AUTH_MESSAGE_PREFIXES = ["opaque_", "ldap_", "saml_", "oauth2_", "mfa_", "key_recovery_"];

/**
 * Check if a message type is an authentication message
 *
 * @param {string} type - Message type
 * @returns {boolean} Whether this is an auth message
 */
function isAuthMessage(type) {
  if (!type) return false;
  return AUTH_MESSAGE_PREFIXES.some((prefix) => type.startsWith(prefix));
}

/**
 * AuthFramework configuration
 * @typedef {Object} AuthFrameworkConfig
 * @property {Object} [opaque={}] - OPAQUE adapter configuration
 * @property {Object} [stateMachine={}] - State machine configuration
 * @property {boolean} [requireAuth=false] - Require auth for all connections
 * @property {Function} [onAuthSuccess] - Callback on successful authentication
 * @property {Function} [onAuthFailure] - Callback on authentication failure
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
function createAuthFramework(config = {}) {
  const {
    opaque: opaqueConfig = {},
    stateMachine: stateMachineConfig = {},
    requireAuth = false,
    onAuthSuccess = () => {},
    onAuthFailure = () => {},
  } = config;

  /** Registered adapters */
  const adapters = new Map();

  /** Per-socket auth state machines */
  const socketStates = new Map();

  /** OPAQUE adapter instance */
  const opaqueAdapter = createOpaqueAdapter(opaqueConfig);
  adapters.set("opaque", opaqueAdapter);

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

    /**
     * Handle an incoming auth message
     *
     * @param {string} type - Message type
     * @param {Object} data - Message data
     * @returns {Promise<Object>} Response message
     */
    async function handleMessage(type, data) {
      const state = stateMachine.getState();

      try {
        // OPAQUE Registration
        if (type === OpaqueMessageType.REG_START) {
          const response = await opaqueAdapter.handleRegStart({
            clientId,
            user: data.user,
            clientNonce: data.clientNonce,
            regRequest: data.regRequest,
          });
          return response;
        }

        if (type === OpaqueMessageType.REG_FINISH) {
          const response = await opaqueAdapter.handleRegFinish({
            clientId,
            user: data.user,
            clientNonce: data.clientNonce,
            regRecord: data.regRecord,
          });
          return response;
        }

        // OPAQUE Authentication
        if (type === OpaqueMessageType.AUTH_START) {
          stateMachine.startAuth("opaque");

          const response = await opaqueAdapter.handleAuthStart({
            clientId,
            user: data.user,
            clientNonce: data.clientNonce,
          });
          return response;
        }

        if (type === OpaqueMessageType.AUTH_2) {
          const response = await opaqueAdapter.handleAuthFinish({
            clientId,
            user: data.user,
            clientNonce: data.clientNonce,
            clientAuth: data.clientAuth,
          });

          const authResult = stateMachine.completeAuth(response.assignedPrincipal);

          onAuthSuccess(clientId, authResult.principal);

          return {
            ...response,
            state: authResult.state,
            tier: authResult.tier,
          };
        }

        // Unknown auth message
        return {
          type: "auth_error",
          error: "UNKNOWN_MESSAGE_TYPE",
          message: `Unknown auth message type: ${type}`,
        };
      } catch (err) {
        if (type === OpaqueMessageType.AUTH_START || type === OpaqueMessageType.AUTH_2) {
          const failResult = stateMachine.failAuth(err.code || "AUTH_ERROR");
          onAuthFailure(clientId, err, failResult);
        }

        return {
          type: type.replace(/_start$|_2$/, "_fail"),
          error: err.code || "AUTH_ERROR",
          message: err.message,
          attempts: stateMachine.getState().attempts,
        };
      }
    }

    /**
     * Get current auth state
     * @returns {Object} Current auth state
     */
    function getState() {
      return stateMachine.getState();
    }

    /**
     * Get current auth tier
     * @returns {number} Current tier (0-3)
     */
    function getTier() {
      return stateMachine.getTier();
    }

    /**
     * Check if socket is authenticated
     * @returns {boolean} Whether socket is authenticated
     */
    function isAuthenticated() {
      return stateMachine.getTier() >= AuthTier.BASIC;
    }

    /**
     * Check if socket meets minimum tier requirement
     *
     * @param {number} requiredTier - Minimum required tier
     * @returns {boolean} Whether socket meets requirement
     */
    function meetsRequirement(requiredTier) {
      return stateMachine.getTier() >= requiredTier;
    }

    /**
     * Check if action is authorized (stub for future per-message authz)
     *
     * @param {string} action - Action/endpoint name
     * @param {Object} [context={}] - Additional context
     * @returns {Object} Authorization result { allowed, reason }
     */
    function authorize(action, context = {}) {
      const state = stateMachine.getState();

      if (!state.isAuthenticated) {
        return {
          allowed: false,
          reason: "NOT_AUTHENTICATED",
          requiredTier: AuthTier.BASIC,
          currentTier: state.tier,
        };
      }

      return {
        allowed: true,
        principal: state.principal,
        tier: state.tier,
      };
    }

    /**
     * Clean up resources when socket disconnects
     */
    function cleanup() {
      stateMachine.cleanup();
      opaqueAdapter.cleanupClient(clientId);
      socketStates.delete(clientId);
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
    AUTH_MESSAGE_PREFIXES,
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
  AUTH_MESSAGE_PREFIXES,
};
