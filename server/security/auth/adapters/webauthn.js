/**
 * @fileoverview WebAuthn Authentication Adapter for api-ape Server
 *
 * Implements WebAuthn (FIDO2) authentication for MFA (Tier 2) elevation.
 * Compatible with Passport.js strategy interface for drop-in replacement.
 *
 * ## Passport.js Compatibility
 *
 * This adapter implements the Passport.js Strategy interface:
 * - Constructor accepts `(options, verify)` or `(verify)` pattern
 * - `authenticate(req, options)` method for request authentication
 * - `this.success(user, info)`, `this.fail(info)`, `this.error(err)` callbacks
 *
 * ## Protocol Flow (Registration)
 *
 * ```
 * Client                              Server
 *   |-- webauthn_reg_start -------->|  (user)
 *   |<- webauthn_reg_challenge -----|  (challenge, rpId, user info)
 *   |-- webauthn_reg_finish ------->|  (attestation response)
 *   |<- webauthn_reg_ok ------------|  (credential stored)
 * ```
 *
 * ## Protocol Flow (Authentication/Assertion)
 *
 * ```
 * Client                              Server
 *   |-- webauthn_auth_start ------->|  (user)
 *   |<- webauthn_auth_challenge ----|  (challenge, allowCredentials)
 *   |-- webauthn_auth_finish ------>|  (assertion response)
 *   |<- webauthn_auth_ok -----------|  (MFA elevated)
 * ```
 *
 * @module server/security/auth/adapters/webauthn
 * @see {@link https://www.passportjs.org/concepts/authentication/strategies/}
 * @see {@link https://webauthn.guide/}
 */

const crypto = require("crypto");

/**
 * WebAuthn adapter configuration
 * @typedef {Object} WebAuthnConfig
 * @property {string} rpId - Relying Party ID (domain)
 * @property {string} rpName - Relying Party display name
 * @property {string} [origin] - Expected origin (defaults to https://{rpId})
 * @property {Function} [getCredentials] - Async function to fetch user's credentials
 * @property {Function} [saveCredential] - Async function to save credential
 * @property {Function} [updateCredential] - Async function to update credential counter
 * @property {Object} [webauthnLib] - WebAuthn library (@simplewebauthn/server)
 * @property {number} [challengeTimeout=60000] - Challenge timeout in ms
 * @property {string} [userVerification='preferred'] - User verification requirement
 * @property {string} [attestation='none'] - Attestation conveyance preference
 * @property {boolean} [passReqToCallback=false] - Pass request to verify callback
 */

/**
 * WebAuthn message types
 * @enum {string}
 */
const WebAuthnMessageType = {
  REG_START: "webauthn_reg_start",
  REG_CHALLENGE: "webauthn_reg_challenge",
  REG_FINISH: "webauthn_reg_finish",
  REG_OK: "webauthn_reg_ok",
  REG_FAIL: "webauthn_reg_fail",
  AUTH_START: "webauthn_auth_start",
  AUTH_CHALLENGE: "webauthn_auth_challenge",
  AUTH_FINISH: "webauthn_auth_finish",
  AUTH_OK: "webauthn_auth_ok",
  AUTH_FAIL: "webauthn_auth_fail",
};

/**
 * WebAuthn error codes
 * @enum {string}
 */
const WebAuthnError = {
  INVALID_ATTESTATION: "INVALID_ATTESTATION",
  INVALID_ASSERTION: "INVALID_ASSERTION",
  CREDENTIAL_NOT_FOUND: "CREDENTIAL_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  CHALLENGE_EXPIRED: "CHALLENGE_EXPIRED",
  CHALLENGE_MISMATCH: "CHALLENGE_MISMATCH",
  COUNTER_MISMATCH: "COUNTER_MISMATCH",
  ORIGIN_MISMATCH: "ORIGIN_MISMATCH",
  RP_ID_MISMATCH: "RP_ID_MISMATCH",
  MISSING_CREDENTIALS: "MISSING_CREDENTIALS",
  DUPLICATE_CREDENTIAL: "DUPLICATE_CREDENTIAL",
};

/** @private In-memory credential store for development */
const _defaultCredentialStore = new Map();

/**
 * Default in-memory credential storage for WebAuthn (for testing/development)
 * @private
 * @type {Object}
 */
const defaultStorage = {
  /**
   * Get all credentials for a user
   * @param {string} userId - User identifier
   * @returns {Promise<Array>} Array of credentials
   */
  async getCredentials(userId) {
    return _defaultCredentialStore.get(userId) || [];
  },
  /**
   * Save a new credential for a user
   * @param {string} userId - User identifier
   * @param {Object} credential - Credential to save
   * @returns {Promise<boolean>} Success
   */
  async saveCredential(userId, credential) {
    const creds = _defaultCredentialStore.get(userId) || [];
    creds.push(credential);
    _defaultCredentialStore.set(userId, creds);
    return true;
  },
  /**
   * Update an existing credential
   * @param {string} userId - User identifier
   * @param {string} credentialId - Credential ID to update
   * @param {Object} updates - Updates to apply
   * @returns {Promise<boolean>} Success
   */
  async updateCredential(userId, credentialId, updates) {
    const creds = _defaultCredentialStore.get(userId) || [];
    const idx = creds.findIndex((c) => c.id === credentialId);
    if (idx >= 0) {
      creds[idx] = { ...creds[idx], ...updates };
      _defaultCredentialStore.set(userId, creds);
      return true;
    }
    return false;
  },
};

/**
 * Create a WebAuthn Strategy compatible with Passport.js
 *
 * @param {WebAuthnConfig|Function} options - Config or verify callback
 * @param {Function} [verify] - Verify callback
 * @returns {Object} WebAuthn adapter/strategy
 *
 * @example
 * // Passport.js style usage
 * const webauthn = createWebAuthnStrategy({
 *   rpId: 'example.com',
 *   rpName: 'Example App'
 * }, (req, user, done) => {
 *   // Custom verification logic
 *   done(null, user);
 * });
 *
 * // Register with Passport
 * passport.use('webauthn', webauthn);
 *
 * // Or use directly with api-ape
 * authFramework.registerAdapter('webauthn', webauthn);
 */
function createWebAuthnStrategy(options, verify) {
  // Passport.js style: allow (verify) or (options, verify)
  if (typeof options === "function") {
    verify = options;
    options = {};
  }

  const {
    rpId = "localhost",
    rpName = "api-ape",
    origin = `https://${rpId}`,
    getCredentials = defaultStorage.getCredentials,
    saveCredential = defaultStorage.saveCredential,
    updateCredential = defaultStorage.updateCredential,
    webauthnLib = null,
    challengeTimeout = 60000,
    userVerification = "preferred",
    attestation = "none",
    passReqToCallback = false,
  } = options;

  /** @type {Map<string, {challenge: string, expiresAt: number, userId: string}>} */
  const pendingChallenges = new Map();

  /**
   * Generate a challenge for WebAuthn ceremony
   * @param {string} userId - User identifier
   * @returns {Object} Challenge info
   * @private
   */
  function generateChallenge(userId) {
    const challenge = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + challengeTimeout;
    const challengeKey = `${userId}:${challenge}`;
    pendingChallenges.set(challengeKey, { challenge, expiresAt, userId });

    // Auto-cleanup expired challenges
    setTimeout(() => {
      pendingChallenges.delete(challengeKey);
    }, challengeTimeout + 1000);

    return { challenge, expiresAt };
  }

  /**
   * Consume and validate a challenge
   * @param {string} userId - User identifier
   * @param {string} challenge - Challenge to validate
   * @returns {boolean} True if valid
   * @throws {Error} If invalid or expired
   * @private
   */
  function consumeChallenge(userId, challenge) {
    const challengeKey = `${userId}:${challenge}`;
    const info = pendingChallenges.get(challengeKey);

    if (!info) {
      const err = new Error("Challenge not found or expired");
      err.code = WebAuthnError.CHALLENGE_EXPIRED;
      throw err;
    }

    if (Date.now() > info.expiresAt) {
      pendingChallenges.delete(challengeKey);
      const err = new Error("Challenge expired");
      err.code = WebAuthnError.CHALLENGE_EXPIRED;
      throw err;
    }

    pendingChallenges.delete(challengeKey);
    return true;
  }

  // DEAD: base64urlToBuffer is a private closure that no internal code path
  // invokes. Kept here (commented) only for review per the user's dead-code
  // audit workflow; will be deleted at step 7.
  // /**
  //  * Convert base64url to Uint8Array
  //  * @param {string} base64url
  //  * @returns {Uint8Array}
  //  * @private
  //  */
  // function base64urlToBuffer(base64url) {
  //   return Buffer.from(base64url, "base64url");
  // }

  /**
   * Convert Uint8Array to base64url
   * @param {Uint8Array|Buffer} buffer
   * @returns {string}
   * @private
   */
  function bufferToBase64url(buffer) {
    return Buffer.from(buffer).toString("base64url");
  }

  // ============================================================
  // Registration Handlers
  // ============================================================

  /**
   * Handle registration start - generate options for navigator.credentials.create()
   *
   * @param {Object} params - Registration parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.userId - User identifier
   * @param {string} params.userName - User display name
   * @param {string} [params.userDisplayName] - User friendly name
   * @returns {Promise<Object>} Registration options
   */
  async function handleRegStart({ clientId, userId, userName, userDisplayName }) {
    const existingCreds = await getCredentials(userId);
    const { challenge, expiresAt } = generateChallenge(userId);

    // Generate user ID bytes if not already in byte form
    const userIdBytes = bufferToBase64url(
      crypto.createHash("sha256").update(userId).digest()
    );

    const registrationOptions = {
      type: WebAuthnMessageType.REG_CHALLENGE,
      challenge,
      expiresAt,
      rp: {
        id: rpId,
        name: rpName,
      },
      user: {
        id: userIdBytes,
        name: userName || userId,
        displayName: userDisplayName || userName || userId,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification,
        authenticatorAttachment: "platform",
      },
      attestation,
      timeout: challengeTimeout,
      excludeCredentials: existingCreds.map((c) => ({
        type: "public-key",
        id: c.id,
        transports: c.transports || ["internal"],
      })),
    };

    return registrationOptions;
  }

  /**
   * Handle registration finish - verify attestation and store credential
   *
   * @param {Object} params - Registration finish parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.userId - User identifier
   * @param {string} params.challenge - Original challenge
   * @param {Object} params.attestation - Attestation response from client
   * @returns {Promise<Object>} Registration result
   */
  async function handleRegFinish({ clientId, userId, challenge, attestation: attestationResponse }) {
    // Validate challenge
    consumeChallenge(userId, challenge);

    let verifiedRegistration;

    if (webauthnLib && webauthnLib.verifyRegistrationResponse) {
      // Use real WebAuthn library
      verifiedRegistration = await webauthnLib.verifyRegistrationResponse({
        response: attestationResponse,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
      });

      if (!verifiedRegistration.verified) {
        const err = new Error("Attestation verification failed");
        err.code = WebAuthnError.INVALID_ATTESTATION;
        throw err;
      }
    } else {
      // Mock verification for development/testing
      // In production, ALWAYS use a real WebAuthn library
      verifiedRegistration = {
        verified: true,
        registrationInfo: {
          credentialID: attestationResponse.id || crypto.randomBytes(32).toString("base64url"),
          credentialPublicKey: attestationResponse.response?.publicKey || "mock-public-key",
          counter: 0,
          credentialDeviceType: "platform",
          credentialBackedUp: false,
        },
      };
    }

    const { registrationInfo } = verifiedRegistration;

    // Check for duplicate credential
    const existingCreds = await getCredentials(userId);
    if (existingCreds.some((c) => c.id === registrationInfo.credentialID)) {
      const err = new Error("Credential already registered");
      err.code = WebAuthnError.DUPLICATE_CREDENTIAL;
      throw err;
    }

    // Store credential
    const credential = {
      id: registrationInfo.credentialID,
      publicKey: registrationInfo.credentialPublicKey,
      counter: registrationInfo.counter,
      deviceType: registrationInfo.credentialDeviceType,
      backedUp: registrationInfo.credentialBackedUp,
      transports: attestationResponse.response?.transports || ["internal"],
      createdAt: Date.now(),
    };

    await saveCredential(userId, credential);

    return {
      type: WebAuthnMessageType.REG_OK,
      credentialId: credential.id,
      message: "WebAuthn credential registered successfully",
    };
  }

  // ============================================================
  // Authentication/Assertion Handlers
  // ============================================================

  /**
   * Handle authentication start - generate options for navigator.credentials.get()
   *
   * @param {Object} params - Authentication parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.userId - User identifier
   * @returns {Promise<Object>} Authentication options
   */
  async function handleAuthStart({ clientId, userId }) {
    const credentials = await getCredentials(userId);

    if (!credentials || credentials.length === 0) {
      const err = new Error("No WebAuthn credentials found for user");
      err.code = WebAuthnError.CREDENTIAL_NOT_FOUND;
      throw err;
    }

    const { challenge, expiresAt } = generateChallenge(userId);

    const authenticationOptions = {
      type: WebAuthnMessageType.AUTH_CHALLENGE,
      challenge,
      expiresAt,
      rpId,
      timeout: challengeTimeout,
      userVerification,
      allowCredentials: credentials.map((c) => ({
        type: "public-key",
        id: c.id,
        transports: c.transports || ["internal"],
      })),
    };

    return authenticationOptions;
  }

  /**
   * Handle authentication finish - verify assertion
   *
   * @param {Object} params - Authentication finish parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.userId - User identifier
   * @param {string} params.challenge - Original challenge
   * @param {Object} params.assertion - Assertion response from client
   * @returns {Promise<Object>} Authentication result
   */
  async function handleAuthFinish({ clientId, userId, challenge, assertion }) {
    // Validate challenge
    consumeChallenge(userId, challenge);

    const credentials = await getCredentials(userId);
    const credential = credentials.find((c) => c.id === assertion.id);

    if (!credential) {
      const err = new Error("Credential not found");
      err.code = WebAuthnError.CREDENTIAL_NOT_FOUND;
      throw err;
    }

    let verifiedAssertion;

    if (webauthnLib && webauthnLib.verifyAuthenticationResponse) {
      // Use real WebAuthn library
      verifiedAssertion = await webauthnLib.verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        authenticator: {
          credentialID: credential.id,
          credentialPublicKey: credential.publicKey,
          counter: credential.counter,
        },
      });

      if (!verifiedAssertion.verified) {
        const err = new Error("Assertion verification failed");
        err.code = WebAuthnError.INVALID_ASSERTION;
        throw err;
      }

      // Update counter to prevent replay attacks
      await updateCredential(userId, credential.id, {
        counter: verifiedAssertion.authenticationInfo.newCounter,
        lastUsed: Date.now(),
      });
    } else {
      // Mock verification for development/testing
      verifiedAssertion = {
        verified: true,
        authenticationInfo: {
          newCounter: credential.counter + 1,
        },
      };

      await updateCredential(userId, credential.id, {
        counter: credential.counter + 1,
        lastUsed: Date.now(),
      });
    }

    return {
      type: WebAuthnMessageType.AUTH_OK,
      credentialId: credential.id,
      method: "webauthn",
      verified: true,
    };
  }

  // ============================================================
  // Passport.js Strategy Interface
  // ============================================================

  /**
   * Passport.js authenticate method
   *
   * This method is called by Passport when authenticating a request.
   * It extracts WebAuthn data from the request and verifies the assertion.
   *
   * @param {Object} req - HTTP/WebSocket request object
   * @param {Object} [authOptions={}] - Authentication options
   */
  function authenticate(req, authOptions = {}) {
    const self = this;
    const { body = {}, query = {} } = req;

    // Extract assertion data from request body or query
    const assertion = body.assertion || query.assertion;
    const challenge = body.challenge || query.challenge;
    const userId = body.userId || query.userId || body.user || query.user;

    if (!assertion || !challenge || !userId) {
      return self.fail({ message: "Missing WebAuthn credentials" }, 400);
    }

    // Verify the assertion
    handleAuthFinish({ clientId: req.clientId || "http", userId, challenge, assertion })
      .then((result) => {
        // Call verify callback if provided (Passport.js pattern)
        if (verify) {
          /**
           * Passport.js verified callback
           * @param {Error|null} err - Error if verification failed
           * @param {Object|false} user - User object or false
           * @param {Object} [info] - Additional info
           * @returns {void}
           */
          const verified = (err, user, info) => {
            if (err) return self.error(err);
            if (!user) return self.fail(info || { message: "Verification failed" });
            return self.success(user, info);
          };

          try {
            if (passReqToCallback) {
              verify(req, { userId, credentialId: result.credentialId }, verified);
            } else {
              verify({ userId, credentialId: result.credentialId }, verified);
            }
          } catch (err) {
            return self.error(err);
          }
        } else {
          // No verify callback - just succeed with user info
          self.success({ userId, credentialId: result.credentialId }, result);
        }
      })
      .catch((err) => {
        self.fail({ message: err.message, code: err.code });
      });
  }

  /**
   * Clean up pending challenges for a client
   * @param {string} clientId - Client identifier
   */
  function cleanupClient(clientId) {
    // Challenges are keyed by userId, not clientId
    // They auto-expire, so minimal cleanup needed
  }

  /**
   * Check if WebAuthn library is configured
   * @returns {boolean}
   */
  function hasWebAuthnLib() {
    return webauthnLib !== null;
  }

  // Build the strategy object
  const strategy = {
    // Passport.js required properties
    name: "webauthn",

    // Passport.js authenticate method
    authenticate,

    // api-ape adapter properties
    type: "webauthn",
    tier: 2,

    // Message types and errors
    MessageType: WebAuthnMessageType,
    Error: WebAuthnError,

    // Handler methods for api-ape message protocol
    handleRegStart,
    handleRegFinish,
    handleAuthStart,
    handleAuthFinish,

    // Utility methods
    cleanupClient,
    hasWebAuthnLib,

    // Expose for testing
    _pendingChallenges: pendingChallenges,
    _defaultCredentialStore,
  };

  return strategy;
}

/**
 * Alias for Passport.js naming convention
 */
const Strategy = createWebAuthnStrategy;

module.exports = {
  createWebAuthnStrategy,
  Strategy,
  WebAuthnMessageType,
  WebAuthnError,
};
