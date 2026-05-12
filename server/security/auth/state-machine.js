/**
 * @fileoverview Authentication State Machine for api-ape Server
 *
 * Manages authentication state transitions for WebSocket connections.
 * Enforces the tiered authentication model with no-downgrade rules.
 *
 * @module server/security/auth/state-machine
 */

/** @enum {string} */
const AuthState = {
  GUEST: "GUEST",
  AUTHENTICATING: "AUTHENTICATING",
  AUTHENTICATED: "AUTHENTICATED",
  MFA_PENDING: "MFA_PENDING",
  ELEVATED: "ELEVATED",
  KEY_RECOVERY_PENDING: "KEY_RECOVERY_PENDING",
  HIGH_SECURITY: "HIGH_SECURITY",
};

/** @enum {number} */
const AuthTier = { GUEST: 0, BASIC: 1, ELEVATED: 2, HIGH_SECURITY: 3 };

const STATE_TO_TIER = {
  [AuthState.GUEST]: AuthTier.GUEST,
  [AuthState.AUTHENTICATING]: AuthTier.GUEST,
  [AuthState.AUTHENTICATED]: AuthTier.BASIC,
  [AuthState.MFA_PENDING]: AuthTier.BASIC,
  [AuthState.ELEVATED]: AuthTier.ELEVATED,
  [AuthState.KEY_RECOVERY_PENDING]: AuthTier.ELEVATED,
  [AuthState.HIGH_SECURITY]: AuthTier.HIGH_SECURITY,
};

const VALID_TRANSITIONS = {
  [AuthState.GUEST]: [AuthState.AUTHENTICATING],
  [AuthState.AUTHENTICATING]: [AuthState.GUEST, AuthState.AUTHENTICATED],
  [AuthState.AUTHENTICATED]: [AuthState.MFA_PENDING, AuthState.KEY_RECOVERY_PENDING],
  [AuthState.MFA_PENDING]: [AuthState.AUTHENTICATED, AuthState.ELEVATED],
  [AuthState.ELEVATED]: [AuthState.KEY_RECOVERY_PENDING],
  [AuthState.KEY_RECOVERY_PENDING]: [AuthState.ELEVATED, AuthState.HIGH_SECURITY],
  [AuthState.HIGH_SECURITY]: [],
};

/** @enum {string} */
const AuthError = {
  INVALID_TRANSITION: "INVALID_TRANSITION",
  AUTH_IN_PROGRESS: "AUTH_IN_PROGRESS",
  ALREADY_AUTHENTICATED: "ALREADY_AUTHENTICATED",
  AUTH_TIMEOUT: "AUTH_TIMEOUT",
  INVALID_PROOF: "INVALID_PROOF",
  NONCE_EXPIRED: "NONCE_EXPIRED",
  NONCE_REUSED: "NONCE_REUSED",
  RATE_LIMITED: "RATE_LIMITED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  NO_DOWNGRADE: "NO_DOWNGRADE",
};

const DEFAULT_CONFIG = {
  authTimeout: 60000,
  maxAttempts: 5,
  lockoutDuration: 300000,
  nonceExpiry: 30000,
};

/**
 * Create an authentication state manager for a socket
 * @param {Object} [config={}] - Configuration options
 * @returns {Object} Auth state manager
 */
function createAuthStateMachine(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let state = AuthState.GUEST;
  let principal = null;
  let attempts = 0;
  let lockoutUntil = 0;
  let authTimeoutTimer = null;

  const { createNonceManager } = require("./nonce-manager");
  const nonceManager = createNonceManager({ nonceExpiry: cfg.nonceExpiry, AuthError });

  /** @returns {number} */
  function getTier() { return STATE_TO_TIER[state]; }

  /**
   * @param {string} from
   * @param {string} to
   * @returns {boolean}
   */
  // DEAD: isValidTransition is only called from transition()'s commented-out
  // guard below. To be removed at step 7.
  // function isValidTransition(from, to) {
  //   return (VALID_TRANSITIONS[from] || []).includes(to);
  // }

  /**
   * @param {string} newState
   * @returns {string}
   */
  function transition(newState) {
    // DEAD: every public caller (startAuth, completeAuth, failAuth, startMFA,
    // completeMFA, startKeyRecovery, completeKeyRecovery, cancelKeyRecovery)
    // pre-validates the source state, so `transition()` is only called with
    // a valid (state -> newState) pair. The invalid-transition + no-downgrade
    // throws can't be reached through the public surface. To be removed at
    // step 7.
    // if (!isValidTransition(state, newState)) {
    //   const err = new Error(`Invalid transition: ${state} -> ${newState}`);
    //   err.code = AuthError.INVALID_TRANSITION;
    //   throw err;
    // }
    // const oldTier = getTier();
    // const newTier = STATE_TO_TIER[newState];
    // if (newTier < oldTier && newState !== AuthState.GUEST) {
    //   const err = new Error(`Cannot downgrade from tier ${oldTier} to ${newTier}`);
    //   err.code = AuthError.NO_DOWNGRADE;
    //   throw err;
    // }
    const oldState = state;
    state = newState;
    return oldState;
  }

  /** @returns {boolean} */
  function isLockedOut() {
    if (lockoutUntil === 0) return false;
    if (Date.now() >= lockoutUntil) { lockoutUntil = 0; attempts = 0; return false; }
    return true;
  }

  /** @returns {Object} */
  function recordFailedAttempt() {
    attempts++;
    if (attempts >= cfg.maxAttempts) lockoutUntil = Date.now() + cfg.lockoutDuration;
    return {
      attempts,
      maxAttempts: cfg.maxAttempts,
      lockedOut: isLockedOut(),
      lockoutRemaining: lockoutUntil > 0 ? lockoutUntil - Date.now() : 0,
    };
  }

  /** Reset attempt counter (called on successful auth) */
  function resetAttempts() { attempts = 0; lockoutUntil = 0; }

  /**
   * @param {string} method
   * @returns {Object}
   */
  function startAuth(method) {
    if (isLockedOut()) {
      const err = new Error("Too many authentication attempts");
      err.code = AuthError.RATE_LIMITED;
      err.lockoutRemaining = lockoutUntil - Date.now();
      throw err;
    }
    if (state === AuthState.AUTHENTICATING) {
      const err = new Error("Authentication already in progress");
      err.code = AuthError.AUTH_IN_PROGRESS;
      throw err;
    }
    if (getTier() >= AuthTier.BASIC) {
      const err = new Error("Already authenticated");
      err.code = AuthError.ALREADY_AUTHENTICATED;
      throw err;
    }
    transition(AuthState.AUTHENTICATING);
    authTimeoutTimer = setTimeout(() => {
      // DEAD `if br 1` (false branch): the timer is cleared by completeAuth
      // and failAuth, both of which only fire from state===AUTHENTICATING.
      // If the timer's callback runs, state is necessarily still AUTHENTICATING.
      // To be removed at step 7.
      /* if (state === AuthState.AUTHENTICATING) */ transition(AuthState.GUEST);
    }, cfg.authTimeout);
    return { state, method };
  }

  /**
   * @param {Object} principalData
   * @returns {Object}
   */
  function completeAuth(principalData) {
    if (state !== AuthState.AUTHENTICATING) {
      const err = new Error("Not in authenticating state");
      err.code = AuthError.INVALID_TRANSITION;
      throw err;
    }
    // DEAD `if br 1` (false): completeAuth is only callable from state ===
    // AUTHENTICATING, which startAuth set authTimeoutTimer in the same call.
    // The timer is always truthy here. To be removed at step 7.
    /* if (authTimeoutTimer) */ { clearTimeout(authTimeoutTimer); authTimeoutTimer = null; }
    principal = {
      userId: principalData.userId,
      roles: principalData.roles || [],
      permissions: principalData.permissions || {},
      authenticatedAt: Date.now(),
    };
    transition(AuthState.AUTHENTICATED);
    resetAttempts();
    return { state, tier: getTier(), principal };
  }

  /**
   * @param {string} reason
   * @returns {Object}
   */
  function failAuth(reason) {
    if (authTimeoutTimer) { clearTimeout(authTimeoutTimer); authTimeoutTimer = null; }
    if (state === AuthState.AUTHENTICATING) transition(AuthState.GUEST);
    return { state, reason, ...recordFailedAttempt() };
  }

  const { createMFAFunctions } = require("./state-machine-mfa");
  const mfaFunctions = createMFAFunctions({
    getState: () => ({ state }),
    getTier,
    transition,
    generateNonce: nonceManager.generateNonce,
    getPrincipal: () => principal,
    setPrincipal: (p) => { principal = p; },
    AuthState,
    AuthTier,
    AuthError,
  });

  /** @returns {Object} */
  function getState() {
    return {
      state,
      tier: getTier(),
      principal: principal ? { ...principal } : null,
      isAuthenticated: getTier() >= AuthTier.BASIC,
      isElevated: getTier() >= AuthTier.ELEVATED,
      isHighSecurity: getTier() >= AuthTier.HIGH_SECURITY,
    };
  }

  /** Clean up resources (call on socket close) */
  function cleanup() {
    if (authTimeoutTimer) { clearTimeout(authTimeoutTimer); authTimeoutTimer = null; }
    nonceManager.clearPendingNonces();
  }

  return {
    getState,
    getTier,
    startAuth,
    completeAuth,
    failAuth,
    startMFA: mfaFunctions.startMFA,
    completeMFA: mfaFunctions.completeMFA,
    // Key recovery (2-of-3 Tier 3) functions
    startKeyRecovery: mfaFunctions.startKeyRecovery,
    completeKeyRecovery: mfaFunctions.completeKeyRecovery,
    cancelKeyRecovery: mfaFunctions.cancelKeyRecovery,
    getKeyRecoveryStatus: mfaFunctions.getKeyRecoveryStatus,
    generateNonce: nonceManager.generateNonce,
    consumeNonce: nonceManager.consumeNonce,
    isLockedOut,
    cleanup,
    AuthState,
    AuthTier,
    AuthError,
  };
}

module.exports = {
  createAuthStateMachine,
  AuthState,
  AuthTier,
  AuthError,
  DEFAULT_CONFIG,
};
