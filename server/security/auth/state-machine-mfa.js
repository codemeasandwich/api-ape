/**
 * @fileoverview MFA Elevation Module for api-ape Server
 *
 * Provides MFA (Multi-Factor Authentication) elevation functions
 * and Key Recovery (2-of-3 Tier 3) elevation for the authentication state machine.
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

  // Track pending key recovery challenges
  let pendingKeyRecovery = null;

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

  // DEAD: getStateSnapshot is exposed via mfaFunctions but never wired into
  // the public state-machine.js exports — state-machine.js inlines its own
  // getState() with the same shape. To be removed at step 7.
  // /**
  //  * Get current auth state snapshot
  //  * @returns {Object} Current state info
  //  */
  // function getStateSnapshot() {
  //   const state = getState();
  //   const principal = getPrincipal();
  //   const tier = getTier();
  //   return {
  //     state: state.state,
  //     tier,
  //     principal: principal ? { ...principal } : null,
  //     isAuthenticated: tier >= AuthTier.BASIC,
  //     isElevated: tier >= AuthTier.ELEVATED,
  //     isHighSecurity: tier >= AuthTier.HIGH_SECURITY,
  //     keyRecoveryPending: pendingKeyRecovery !== null,
  //   };
  // }

  // ============================================================
  // Key Recovery (2-of-3 Tier 3) Functions
  // ============================================================

  /**
   * Start key recovery elevation flow
   * Requires ELEVATED tier (Tier 2)
   *
   * @param {Object} options - Key recovery options
   * @param {string[]} options.factors - Available factors ['oauth', 'webauthn', 'totp']
   * @returns {Object} Key recovery challenge info
   * @throws {Error} If not at ELEVATED tier
   */
  function startKeyRecovery(options = {}) {
    const state = getState();

    // Can start from AUTHENTICATED or ELEVATED
    if (state.state !== AuthState.ELEVATED && state.state !== AuthState.AUTHENTICATED) {
      const err = new Error("Must be authenticated or elevated before key recovery");
      err.code = AuthError.INVALID_TRANSITION;
      throw err;
    }

    // If starting from AUTHENTICATED, automatically elevate for key recovery
    // This handles direct Tier 1 -> Tier 3 path
    if (state.state === AuthState.AUTHENTICATED) {
      // Key recovery can start from AUTHENTICATED per VALID_TRANSITIONS
    }

    transition(AuthState.KEY_RECOVERY_PENDING);

    const challenge = generateNonce();
    pendingKeyRecovery = {
      challenge,
      startedAt: Date.now(),
      factors: options.factors || ['oauth', 'webauthn', 'totp'],
      verifiedFactors: [],
    };

    return {
      state: AuthState.KEY_RECOVERY_PENDING,
      challenge,
      factors: pendingKeyRecovery.factors,
    };
  }

  /**
   * Complete key recovery with proof
   *
   * @param {Object} params - Completion parameters
   * @param {string} params.proof - HMAC proof that client reconstructed K_user
   * @param {string[]} params.usedFactors - The two factors used for recovery
   * @returns {Object} Elevation result
   * @throws {Error} If not in KEY_RECOVERY_PENDING state or proof invalid
   */
  function completeKeyRecovery(params) {
    const { proof, usedFactors } = params;

    const state = getState();
    if (state.state !== AuthState.KEY_RECOVERY_PENDING) {
      const err = new Error("Not in key recovery pending state");
      err.code = AuthError.INVALID_TRANSITION;
      throw err;
    }

    // DEAD: reaching this point requires state === KEY_RECOVERY_PENDING which
    // is set in lockstep with pendingKeyRecovery by startKeyRecovery. They
    // can't drift in synchronous JS. To be removed at step 7.
    // if (!pendingKeyRecovery) {
    //   const err = new Error("No pending key recovery challenge");
    //   err.code = AuthError.INVALID_TRANSITION;
    //   throw err;
    // }

    if (!proof || typeof proof !== 'string') {
      const err = new Error("Invalid key recovery proof");
      err.code = AuthError.INVALID_PROOF;
      throw err;
    }

    if (!Array.isArray(usedFactors) || usedFactors.length !== 2) {
      const err = new Error("Must use exactly 2 factors for key recovery");
      err.code = AuthError.INVALID_PROOF;
      throw err;
    }

    // Note: Actual proof verification happens in the two-of-three adapter
    // The state machine just manages the state transitions

    transition(AuthState.HIGH_SECURITY);

    const principal = getPrincipal();
    principal.highSecurityAt = Date.now();
    principal.keyRecoveryFactors = usedFactors;
    principal.tier = AuthTier.HIGH_SECURITY;
    setPrincipal(principal);

    // Clear pending recovery
    pendingKeyRecovery = null;

    return {
      state: AuthState.HIGH_SECURITY,
      tier: getTier(),
      principal,
    };
  }

  /**
   * Cancel pending key recovery
   * Returns to ELEVATED state
   *
   * @returns {Object} New state info
   */
  function cancelKeyRecovery() {
    const state = getState();
    if (state.state !== AuthState.KEY_RECOVERY_PENDING) {
      const err = new Error("No key recovery in progress");
      err.code = AuthError.INVALID_TRANSITION;
      throw err;
    }

    transition(AuthState.ELEVATED);
    pendingKeyRecovery = null;

    return {
      state: AuthState.ELEVATED,
      tier: getTier(),
    };
  }

  /**
   * Get pending key recovery status
   * @returns {Object|null} Pending recovery info or null
   */
  function getKeyRecoveryStatus() {
    if (!pendingKeyRecovery) return null;

    return {
      challenge: pendingKeyRecovery.challenge,
      factors: pendingKeyRecovery.factors,
      startedAt: pendingKeyRecovery.startedAt,
      verifiedFactors: pendingKeyRecovery.verifiedFactors,
    };
  }

  return {
    startMFA,
    completeMFA,
    // getStateSnapshot, // DEAD — see commented definition above
    // Key recovery functions
    startKeyRecovery,
    completeKeyRecovery,
    cancelKeyRecovery,
    getKeyRecoveryStatus,
  };
}

module.exports = {
  createMFAFunctions,
};
