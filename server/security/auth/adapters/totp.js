/**
 * @fileoverview TOTP Authentication Adapter for api-ape Server
 *
 * Implements Time-based One-Time Password (RFC 6238) authentication
 * for MFA (Tier 2) elevation. Compatible with Passport.js strategy interface.
 *
 * ## Passport.js Compatibility
 *
 * This adapter implements the Passport.js Strategy interface:
 * - Constructor accepts `(options, verify)` or `(verify)` pattern
 * - `authenticate(req, options)` method for request authentication
 * - `this.success(user, info)`, `this.fail(info)`, `this.error(err)` callbacks
 *
 * ## Protocol Flow (Setup)
 *
 * ```
 * Client                              Server
 *   |-- totp_setup_start ----------->|  (user)
 *   |<- totp_setup_challenge --------|  (secret, otpauth URI, QR data)
 *   |-- totp_setup_verify ---------->|  (code to verify setup)
 *   |<- totp_setup_ok ---------------|  (TOTP enabled)
 * ```
 *
 * ## Protocol Flow (Verification)
 *
 * ```
 * Client                              Server
 *   |-- totp_verify ---------------->|  (user, code)
 *   |<- totp_ok --------------------|  (MFA elevated)
 * ```
 *
 * @module server/security/auth/adapters/totp
 * @see {@link https://www.passportjs.org/concepts/authentication/strategies/}
 * @see {@link https://datatracker.ietf.org/doc/html/rfc6238}
 */

const crypto = require("crypto");

/**
 * TOTP adapter configuration
 * @typedef {Object} TOTPConfig
 * @property {string} [issuer='api-ape'] - Issuer name for otpauth URI
 * @property {number} [digits=6] - Number of digits in TOTP code
 * @property {number} [period=30] - Time period in seconds
 * @property {string} [algorithm='SHA1'] - HMAC algorithm (SHA1, SHA256, SHA512)
 * @property {number} [window=1] - Acceptable time window (periods before/after)
 * @property {Function} [getSecret] - Async function to fetch user's TOTP secret
 * @property {Function} [saveSecret] - Async function to save user's TOTP secret
 * @property {Function} [deleteSecret] - Async function to delete user's TOTP secret
 * @property {Object} [totpLib] - TOTP library (otplib, speakeasy)
 * @property {boolean} [passReqToCallback=false] - Pass request to verify callback
 */

/**
 * TOTP message types
 * @enum {string}
 */
const TOTPMessageType = {
  SETUP_START: "totp_setup_start",
  SETUP_CHALLENGE: "totp_setup_challenge",
  SETUP_VERIFY: "totp_setup_verify",
  SETUP_OK: "totp_setup_ok",
  SETUP_FAIL: "totp_setup_fail",
  VERIFY: "totp_verify",
  OK: "totp_ok",
  FAIL: "totp_fail",
  DISABLE_START: "totp_disable_start",
  DISABLE_OK: "totp_disable_ok",
};

/**
 * TOTP error codes
 * @enum {string}
 */
const TOTPError = {
  INVALID_CODE: "INVALID_CODE",
  SECRET_NOT_FOUND: "SECRET_NOT_FOUND",
  ALREADY_ENABLED: "ALREADY_ENABLED",
  NOT_ENABLED: "NOT_ENABLED",
  SETUP_EXPIRED: "SETUP_EXPIRED",
  MISSING_CODE: "MISSING_CODE",
  MISSING_USER: "MISSING_USER",
  CODE_REUSED: "CODE_REUSED",
};

/** @private In-memory secret store for development */
const _defaultSecretStore = new Map();

/** @private Pending setup sessions */
const _pendingSetups = new Map();

/** @private Recently used codes (replay protection) */
const _recentlyUsedCodes = new Map();

/**
 * Default in-memory storage for TOTP secrets (for testing/development)
 * @private
 * @type {Object}
 */
const defaultStorage = {
  /**
   * Get TOTP secret for a user
   * @param {string} userId - User identifier
   * @returns {Promise<Object|null>} Secret data or null
   */
  async getSecret(userId) {
    return _defaultSecretStore.get(userId) || null;
  },
  /**
   * Save TOTP secret for a user
   * @param {string} userId - User identifier
   * @param {Object} secretData - Secret data to save
   * @returns {Promise<boolean>} Success
   */
  async saveSecret(userId, secretData) {
    _defaultSecretStore.set(userId, secretData);
    return true;
  },
  /**
   * Delete TOTP secret for a user
   * @param {string} userId - User identifier
   * @returns {Promise<boolean>} Success
   */
  async deleteSecret(userId) {
    _defaultSecretStore.delete(userId);
    return true;
  },
};

/**
 * Generate a random base32-encoded secret
 * @param {number} [length=20] - Secret length in bytes
 * @returns {string} Base32-encoded secret
 * @private
 */
function generateSecret(length = 20) {
  const bytes = crypto.randomBytes(length);
  return base32Encode(bytes);
}

/**
 * Encode bytes to base32 (RFC 4648)
 * @param {Buffer} buffer - Bytes to encode
 * @returns {string} Base32-encoded string
 * @private
 */
function base32Encode(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decode base32 (RFC 4648) to bytes
 * @param {string} encoded - Base32-encoded string
 * @returns {Buffer} Decoded bytes
 * @private
 */
function base32Decode(encoded) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanEncoded = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let value = 0;
  const output = [];

  for (let i = 0; i < cleanEncoded.length; i++) {
    const idx = alphabet.indexOf(cleanEncoded[i]);
    // DEAD: cleanEncoded was filtered by /[^A-Z2-7]/g, so every char is in
    // the 32-symbol alphabet — idx is always ≥ 0. To be removed at step 7.
    // if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Generate TOTP code using HMAC-based algorithm (RFC 6238)
 * @param {string} secret - Base32-encoded secret
 * @param {number} counter - Time counter
 * @param {Object} options - Algorithm options
 * @returns {string} TOTP code
 * @private
 */
function generateTOTP(secret, counter, options = {}) {
  const { digits = 6, algorithm = "SHA1" } = options;

  const secretBuffer = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmacAlgorithm = algorithm.toLowerCase().replace("-", "");
  const hmac = crypto.createHmac(hmacAlgorithm, secretBuffer);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  // Dynamic truncation (RFC 4226)
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
}

/**
 * Verify a TOTP code
 * @param {string} secret - Base32-encoded secret
 * @param {string} code - Code to verify
 * @param {Object} options - Verification options
 * @returns {Object} Verification result { valid, delta }
 * @private
 */
function verifyTOTP(secret, code, options = {}) {
  const { digits = 6, period = 30, window = 1, algorithm = "SHA1" } = options;

  const currentTime = Math.floor(Date.now() / 1000);
  const currentCounter = Math.floor(currentTime / period);

  // Check current and adjacent time windows
  for (let delta = -window; delta <= window; delta++) {
    const counter = currentCounter + delta;
    const expectedCode = generateTOTP(secret, counter, { digits, algorithm });

    if (timingSafeEqual(code, expectedCode)) {
      return { valid: true, delta, counter };
    }
  }

  return { valid: false, delta: null, counter: null };
}

/**
 * Timing-safe string comparison
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} Whether strings are equal
 * @private
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    // Compare against itself to maintain constant time
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Generate otpauth:// URI for authenticator apps
 * @param {Object} params - URI parameters
 * @returns {string} otpauth URI
 * @private
 */
function generateOtpauthURI({ secret, issuer, accountName, algorithm, digits, period }) {
  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("issuer", issuer);
  if (algorithm && algorithm !== "SHA1") params.set("algorithm", algorithm);
  if (digits && digits !== 6) params.set("digits", digits.toString());
  if (period && period !== 30) params.set("period", period.toString());

  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);

  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?${params.toString()}`;
}

/**
 * Create a TOTP Strategy compatible with Passport.js
 *
 * @param {TOTPConfig|Function} options - Config or verify callback
 * @param {Function} [verify] - Verify callback
 * @returns {Object} TOTP adapter/strategy
 *
 * @example
 * // Passport.js style usage
 * const totp = createTOTPStrategy({
 *   issuer: 'My App'
 * }, (req, user, done) => {
 *   // Custom verification logic
 *   done(null, user);
 * });
 *
 * // Register with Passport
 * passport.use('totp', totp);
 *
 * // Or use directly with api-ape
 * authFramework.registerAdapter('totp', totp);
 */
function createTOTPStrategy(options, verify) {
  // Passport.js style: allow (verify) or (options, verify)
  if (typeof options === "function") {
    verify = options;
    options = {};
  }

  const {
    issuer = "api-ape",
    digits = 6,
    period = 30,
    algorithm = "SHA1",
    window = 1,
    getSecret = defaultStorage.getSecret,
    saveSecret = defaultStorage.saveSecret,
    deleteSecret = defaultStorage.deleteSecret,
    totpLib = null,
    passReqToCallback = false,
    setupTimeout = 300000, // 5 minutes to complete setup
  } = options;

  /** @type {Map<string, {secret: string, expiresAt: number}>} */
  const pendingSetups = new Map();

  /** @type {Map<string, Set<number>>} */
  const usedCounters = new Map();

  // ============================================================
  // Setup Handlers
  // ============================================================

  /**
   * Handle TOTP setup start - generate secret and QR code data
   *
   * @param {Object} params - Setup parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.userId - User identifier
   * @param {string} [params.accountName] - Account display name
   * @returns {Promise<Object>} Setup challenge
   */
  async function handleSetupStart({ clientId, userId, accountName }) {
    // Check if TOTP already enabled
    const existingSecret = await getSecret(userId);
    if (existingSecret && existingSecret.enabled) {
      const err = new Error("TOTP already enabled for this user");
      err.code = TOTPError.ALREADY_ENABLED;
      throw err;
    }

    const secret = generateSecret(20);
    const expiresAt = Date.now() + setupTimeout;

    // Store pending setup
    pendingSetups.set(userId, { secret, expiresAt });

    // Auto-cleanup expired setups
    setTimeout(() => {
      const setup = pendingSetups.get(userId);
      if (setup && setup.secret === secret) {
        pendingSetups.delete(userId);
      }
    }, setupTimeout + 1000);

    const otpauthUri = generateOtpauthURI({
      secret,
      issuer,
      accountName: accountName || userId,
      algorithm,
      digits,
      period,
    });

    return {
      type: TOTPMessageType.SETUP_CHALLENGE,
      secret, // Only shown once during setup
      otpauthUri,
      algorithm,
      digits,
      period,
      expiresAt,
      // QR code can be generated client-side from otpauthUri
    };
  }

  /**
   * Handle TOTP setup verification - verify code and enable TOTP
   *
   * @param {Object} params - Verification parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.userId - User identifier
   * @param {string} params.code - Verification code
   * @returns {Promise<Object>} Setup result
   */
  async function handleSetupVerify({ clientId, userId, code }) {
    const setup = pendingSetups.get(userId);

    if (!setup) {
      const err = new Error("No pending TOTP setup found");
      err.code = TOTPError.SETUP_EXPIRED;
      throw err;
    }

    if (Date.now() > setup.expiresAt) {
      pendingSetups.delete(userId);
      const err = new Error("TOTP setup expired");
      err.code = TOTPError.SETUP_EXPIRED;
      throw err;
    }

    // Verify the code
    let result;
    if (totpLib && totpLib.verify) {
      result = totpLib.verify({ token: code, secret: setup.secret });
      result = { valid: result };
    } else {
      result = verifyTOTP(setup.secret, code, { digits, period, window, algorithm });
    }

    if (!result.valid) {
      const err = new Error("Invalid verification code");
      err.code = TOTPError.INVALID_CODE;
      throw err;
    }

    // Save the secret
    await saveSecret(userId, {
      secret: setup.secret,
      algorithm,
      digits,
      period,
      enabled: true,
      enabledAt: Date.now(),
    });

    // Clean up pending setup
    pendingSetups.delete(userId);

    return {
      type: TOTPMessageType.SETUP_OK,
      message: "TOTP enabled successfully",
    };
  }

  // ============================================================
  // Verification Handlers
  // ============================================================

  /**
   * Handle TOTP verification
   *
   * @param {Object} params - Verification parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.userId - User identifier
   * @param {string} params.code - TOTP code
   * @returns {Promise<Object>} Verification result
   */
  async function handleVerify({ clientId, userId, code }) {
    if (!code) {
      const err = new Error("TOTP code required");
      err.code = TOTPError.MISSING_CODE;
      throw err;
    }

    const secretData = await getSecret(userId);

    if (!secretData || !secretData.enabled) {
      const err = new Error("TOTP not enabled for this user");
      err.code = TOTPError.NOT_ENABLED;
      throw err;
    }

    // Verify the code
    let result;
    if (totpLib && totpLib.verify) {
      result = totpLib.verify({
        token: code,
        secret: secretData.secret,
        window,
      });
      result = { valid: result };
    } else {
      result = verifyTOTP(secretData.secret, code, {
        digits: secretData.digits || digits,
        period: secretData.period || period,
        window,
        algorithm: secretData.algorithm || algorithm,
      });
    }

    if (!result.valid) {
      const err = new Error("Invalid TOTP code");
      err.code = TOTPError.INVALID_CODE;
      throw err;
    }

    // Replay protection - track used counters
    if (result.counter !== undefined && result.counter !== null) {
      const userCounters = usedCounters.get(userId) || new Set();
      if (userCounters.has(result.counter)) {
        const err = new Error("TOTP code already used");
        err.code = TOTPError.CODE_REUSED;
        throw err;
      }
      userCounters.add(result.counter);
      usedCounters.set(userId, userCounters);

      // Clean up old counters (keep last 10)
      if (userCounters.size > 10) {
        const sorted = Array.from(userCounters).sort((a, b) => a - b);
        sorted.slice(0, sorted.length - 10).forEach((c) => userCounters.delete(c));
      }
    }

    return {
      type: TOTPMessageType.OK,
      method: "totp",
      verified: true,
    };
  }

  /**
   * Handle TOTP disable
   *
   * @param {Object} params - Disable parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.userId - User identifier
   * @param {string} params.code - TOTP code to confirm
   * @returns {Promise<Object>} Disable result
   */
  async function handleDisable({ clientId, userId, code }) {
    // Verify current code before disabling
    await handleVerify({ clientId, userId, code });

    await deleteSecret(userId);
    usedCounters.delete(userId);

    return {
      type: TOTPMessageType.DISABLE_OK,
      message: "TOTP disabled successfully",
    };
  }

  // ============================================================
  // Passport.js Strategy Interface
  // ============================================================

  /**
   * Passport.js authenticate method
   *
   * This method is called by Passport when authenticating a request.
   * It extracts TOTP code from the request and verifies it.
   *
   * @param {Object} req - HTTP/WebSocket request object
   * @param {Object} [authOptions={}] - Authentication options
   */
  function authenticate(req, authOptions = {}) {
    const self = this;
    const { body = {}, query = {} } = req;

    // Extract TOTP data from request
    const code = body.code || query.code || body.totp || query.totp;
    const userId = body.userId || query.userId || body.user || query.user;

    if (!code) {
      return self.fail({ message: "Missing TOTP code" }, 400);
    }

    if (!userId) {
      return self.fail({ message: "Missing user identifier" }, 400);
    }

    // Verify the code
    handleVerify({ clientId: req.clientId || "http", userId, code })
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
              verify(req, { userId }, verified);
            } else {
              verify({ userId }, verified);
            }
          } catch (err) {
            return self.error(err);
          }
        } else {
          // No verify callback - succeed with user info
          self.success({ userId }, result);
        }
      })
      .catch((err) => {
        self.fail({ message: err.message, code: err.code });
      });
  }

  /**
   * Check if user has TOTP enabled
   *
   * @param {string} userId - User identifier
   * @returns {Promise<boolean>} Whether TOTP is enabled
   */
  async function isEnabled(userId) {
    const secretData = await getSecret(userId);
    return !!(secretData && secretData.enabled);
  }

  /**
   * Clean up resources for a client
   * @param {string} clientId - Client identifier
   */
  function cleanupClient(clientId) {
    // Setups are keyed by userId, auto-expire
  }

  /**
   * Check if TOTP library is configured
   * @returns {boolean}
   */
  function hasTOTPLib() {
    return totpLib !== null;
  }

  // Build the strategy object
  const strategy = {
    // Passport.js required properties
    name: "totp",

    // Passport.js authenticate method
    authenticate,

    // api-ape adapter properties
    type: "totp",
    tier: 2,

    // Message types and errors
    MessageType: TOTPMessageType,
    Error: TOTPError,

    // Handler methods for api-ape message protocol
    handleSetupStart,
    handleSetupVerify,
    handleVerify,
    handleDisable,

    // Utility methods
    isEnabled,
    cleanupClient,
    hasTOTPLib,

    // Expose for testing
    _pendingSetups: pendingSetups,
    _usedCounters: usedCounters,
    _defaultSecretStore,

    // Expose crypto utilities for testing
    _generateSecret: generateSecret,
    _generateTOTP: generateTOTP,
    _verifyTOTP: verifyTOTP,
  };

  return strategy;
}

/**
 * Alias for Passport.js naming convention
 */
const Strategy = createTOTPStrategy;

module.exports = {
  createTOTPStrategy,
  Strategy,
  TOTPMessageType,
  TOTPError,
};
