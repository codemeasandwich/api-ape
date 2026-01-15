/**
 * @fileoverview MFA Elevation Module for api-ape Server
 *
 * Provides MFA (Multi-Factor Authentication) elevation functions
 * for the authentication state machine.
 *
 * @module server/security/auth/state-machine-mfa
 * @see {@link module:server/security/auth/state-machine} for the main state machine
 */

/**
 * Create MFA elevation functions
 *
 * @param {Object} deps - Dependencies
 * @param {Function} deps.getState - Get current state function
 * @param {Function} deps.getTier - Get current tier function
 * @param {Function} deps.transition - State transition function
 * @param {Function} deps.generateNonce - Nonce generator
 * @param {Function} deps.getPrincipal - Get principal function
 * @param {Function} deps.setPrincipal - Set principal function
 * @param {Object} deps.AuthState - State enum
 * @param {Object} deps.AuthTier - Tier enum
 * @param {Object} deps.AuthError - Error enum
 * @returns {Object} MFA functions
 */
function createMFAFunctions(deps) {
  const {
    getState,
    getTier,
    transition,
    generateNonce,
    getPrincipal,
    setPrincipal,
    AuthState,
    AuthTier,
    AuthError,
  } = deps;

  /**
   * Start MFA elevation flow
   *
   * @param {string[]} methods - Available MFA methods
   * @throws {Error} If not at Tier 1
   * @returns {Object} MFA challenge info
   */
  function startMFA(methods) {
    const state = getState();
    if (state.state !== AuthState.AUTHENTICATED) {
      const err = new Error("Must be authenticated before MFA");
      err.code = AuthError.INVALID_TRANSITION;
      throw err;
    }

    transition(AuthState.MFA_PENDING);

    return {
      state: AuthState.MFA_PENDING,
      methods,
      challenge: generateNonce(),
    };
  }

  /**
   * Complete MFA elevation
   *
   * @param {string} method - MFA method used
   * @returns {Object} Elevation result
   */
  function completeMFA(method) {
    const state = getState();
    if (state.state !== AuthState.MFA_PENDING) {
      const err = new Error("Not in MFA pending state");
      err.code = AuthError.INVALID_TRANSITION;
      throw err;
    }

    transition(AuthState.ELEVATED);

    const principal = getPrincipal();
    principal.elevatedAt = Date.now();
    principal.mfaMethod = method;
    setPrincipal(principal);

    return {
      state: AuthState.ELEVATED,
      tier: getTier(),
      principal,
    };
  }

  /**
   * Get current auth state snapshot
   * @returns {Object} Current state info
   */
  function getStateSnapshot() {
    const state = getState();
    const principal = getPrincipal();
    const tier = getTier();
    return {
      state: state.state,
      tier,
      principal: principal ? { ...principal } : null,
      isAuthenticated: tier >= AuthTier.BASIC,
      isElevated: tier >= AuthTier.ELEVATED,
      isHighSecurity: tier >= AuthTier.HIGH_SECURITY,
    };
  }

  return {
    startMFA,
    completeMFA,
    getStateSnapshot,
  };
}

module.exports = {
  createMFAFunctions,
};
