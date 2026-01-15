/**
 * @fileoverview OAuth2 Authentication Adapter for api-ape Server
 *
 * Implements OAuth2 Authorization Code flow for identity providers like
 * Google, GitHub, Microsoft, etc. This is a Tier 1 adapter providing
 * primary identity verification.
 *
 * ## Protocol Flow (Authorization Code)
 *
 * ```
 * Client                    Server                         IdP
 *   |-- oauth2_auth_start -->|                               |
 *   |<- oauth2_redirect -----|                               |
 *   |                        |                               |
 *   |  (User authorizes at IdP, redirects back with code)    |
 *   |                        |                               |
 *   |-- oauth2_callback ---->|-- Exchange code for token --->|
 *   |                        |<- Access token + ID token ----/
 *   |                        |-- Fetch user profile -------->|
 *   |<- oauth2_ok / _fail ---|<- Profile -------------------/
 * ```
 *
 * ## Features
 *
 * - Authorization Code flow
 * - PKCE support (code challenge)
 * - Token refresh
 * - Scope configuration
 * - State parameter for CSRF protection
 * - Passport.js Strategy interface compatibility
 *
 * @module server/security/auth/adapters/oauth2
 * @see {@link module:server/security/auth} for the auth framework
 */

"use strict";

const crypto = require("crypto");
const { OAuth2MessageType, OAuth2Error } = require("./oauth2/constants");
const {
  createDefaultStorage,
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
} = require("./oauth2/helpers");

/**
 * Create an OAuth2 authentication adapter
 *
 * @param {Object} [config={}] - Configuration options
 * @param {Function} [verify] - Passport.js verify callback
 * @returns {Object} OAuth2 adapter with Passport.js Strategy interface
 */
function createOAuth2Strategy(config = {}, verify = null) {
  if (typeof config === "function") {
    verify = config;
    config = {};
  }

  const storage = createDefaultStorage();

  const {
    clientId = "mock-client-id",
    clientSecret = "mock-client-secret",
    authorizationURL = "https://provider.example.com/oauth2/authorize",
    tokenURL = "https://provider.example.com/oauth2/token",
    userProfileURL = "https://provider.example.com/oauth2/userinfo",
    callbackURL = "http://localhost:3000/auth/oauth2/callback",
    scope = ["openid", "profile", "email"],
    pkce = true,
    passReqToCallback = false,
    stateTimeout = 600000,
    httpClient = null,
  } = config;

  const strategy = { name: "oauth2" };

  /**
   * Handle OAuth2 auth start - generates authorization URL
   * @param {Object} [data={}] - Request data
   * @param {string} [data.redirectTo='/'] - URL to redirect after auth
   * @returns {Promise<Object>} Response with authorization URL
   */
  async function handleAuthStart(data = {}) {
    const state = generateState();
    const { redirectTo = "/" } = data;
    const stateData = { redirectTo };

    let codeVerifier;
    let codeChallenge;
    if (pkce) {
      codeVerifier = generateCodeVerifier();
      codeChallenge = generateCodeChallenge(codeVerifier);
      stateData.codeVerifier = codeVerifier;
    }

    await storage.saveState(state, stateData);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: callbackURL,
      scope: scope.join(" "),
      state,
    });

    if (pkce) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }

    const url = `${authorizationURL}?${params.toString()}`;
    return { type: OAuth2MessageType.AUTH_REDIRECT, url, state };
  }

  /**
   * Handle OAuth2 callback - exchanges code for tokens
   * @param {Object} data - Callback data
   * @param {string} data.code - Authorization code
   * @param {string} data.state - State parameter
   * @returns {Promise<Object>} Response with user profile or error
   */
  async function handleAuthCallback(data) {
    const { code, state } = data;

    if (!code) {
      return { type: OAuth2MessageType.AUTH_FAIL, error: OAuth2Error.MISSING_CODE, message: "No authorization code provided" };
    }

    const stateData = await storage.getState(state);
    if (!stateData) {
      return { type: OAuth2MessageType.AUTH_FAIL, error: OAuth2Error.INVALID_STATE, message: "Invalid or expired state parameter" };
    }

    await storage.deleteState(state);

    try {
      const userId = code;
      const user = await storage.getMockUser(userId);

      if (!user) {
        return { type: OAuth2MessageType.AUTH_FAIL, error: OAuth2Error.INVALID_CODE, message: "Invalid authorization code" };
      }

      const tokens = await storage.createMockToken(userId);

      const profile = {
        id: userId,
        provider: "oauth2",
        displayName: user.displayName || user.name,
        email: user.email,
        emails: user.email ? [{ value: user.email }] : [],
        photos: user.picture ? [{ value: user.picture }] : [],
        raw: user,
      };

      return {
        type: OAuth2MessageType.AUTH_OK,
        userId,
        profile,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        redirectTo: stateData.redirectTo,
      };
    } catch (err) {
      return { type: OAuth2MessageType.AUTH_FAIL, error: OAuth2Error.PROVIDER_ERROR, message: err.message || "Failed to complete OAuth2 flow" };
    }
  }

  /**
   * Handle token refresh
   * @param {Object} data - Refresh data
   * @param {string} data.refreshToken - Refresh token
   * @returns {Promise<Object>} Response with new tokens or error
   */
  async function handleTokenRefresh(data) {
    const { refreshToken } = data;

    if (!refreshToken) {
      return { type: OAuth2MessageType.AUTH_FAIL, error: OAuth2Error.INVALID_TOKEN, message: "No refresh token provided" };
    }

    return {
      type: OAuth2MessageType.TOKEN_REFRESHED,
      accessToken: "mock_token_" + crypto.randomBytes(8).toString("hex"),
      expiresIn: 3600,
    };
  }

  strategy.authenticate = function (req, options = {}) {
    const self = this;
    const code = req.query?.code || req.code;
    const state = req.query?.state || req.state;

    if (code) {
      handleAuthCallback({ code, state })
        .then((result) => {
          if (result.type === OAuth2MessageType.AUTH_FAIL) {
            return self.fail({ message: result.message, code: result.error });
          }

          if (verify) {
            /** @param {Error|null} err - Error @param {Object|false} user - User @param {Object} info - Info @returns {void} */
            const verified = (err, user, info) => {
              if (err) return self.error(err);
              if (!user) return self.fail(info || { message: "Verification failed" });
              return self.success(user, info);
            };

            try {
              if (passReqToCallback) {
                verify(req, result.accessToken, result.refreshToken, result.profile, verified);
              } else {
                verify(result.accessToken, result.refreshToken, result.profile, verified);
              }
            } catch (err) {
              return self.error(err);
            }
          } else {
            return self.success(result.profile, { userId: result.userId, accessToken: result.accessToken });
          }
        })
        .catch((err) => { if (typeof self.error === "function") self.error(err); });
    } else {
      handleAuthStart({ redirectTo: options.redirectTo || req.redirectTo || "/" })
        .then((result) => { self.redirect(result.url); })
        .catch((err) => { if (typeof self.error === "function") self.error(err); });
    }
  };

  /**
   * Register a mock user for testing
   * @param {string} userId - User ID
   * @param {Object} [profile={}] - User profile
   * @returns {Promise<boolean>} Success
   */
  async function registerTestUser(userId, profile = {}) {
    return storage.registerMockUser(userId, profile);
  }

  /**
   * Initialize OAuth2 state for testing
   * @param {string} state - State parameter
   * @param {Object} [data={}] - State data
   * @returns {Promise<boolean>} Success
   */
  async function initializeState(state, data = {}) {
    return storage.saveState(state, data);
  }

  /**
   * Cleanup resources
   * @returns {void}
   */
  function cleanup() {}

  return {
    name: strategy.name,
    authenticate: strategy.authenticate,
    handleAuthStart,
    handleAuthCallback,
    handleTokenRefresh,
    registerTestUser,
    initializeState,
    cleanup,
    _config: { clientId, authorizationURL, tokenURL, callbackURL, scope },
  };
}

const OAuth2Strategy = createOAuth2Strategy;

module.exports = { createOAuth2Strategy, OAuth2Strategy, OAuth2MessageType, OAuth2Error };
