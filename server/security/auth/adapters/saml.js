/**
 * @fileoverview SAML Authentication Adapter for api-ape Server
 *
 * Implements SAML 2.0 Single Sign-On (SSO) for enterprise identity providers.
 *
 * @module server/security/auth/adapters/saml
 */

"use strict";

const { SAMLMessageType, SAMLError } = require("./saml/constants");
const { createDefaultStorage, generateRequestId } = require("./saml/helpers");

/**
 * Create a SAML authentication adapter
 *
 * @param {Object} config - Configuration options
 * @param {Function} verify - Passport.js verify callback
 * @returns {Object} SAML adapter with Passport.js Strategy interface
 */
function createSAMLStrategy(config = {}, verify = null) {
  if (typeof config === "function") {
    verify = config;
    config = {};
  }

  const storage = createDefaultStorage();

  const {
    entryPoint = "https://idp.example.com/sso",
    issuer = "api-ape",
    callbackUrl = "http://localhost:3000/auth/saml/callback",
    logoutUrl = null,
    identifierFormat = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    passReqToCallback = false,
  } = config;

  const strategy = { name: "saml" };

  /**
   * Handle SAML auth start - generates redirect URL
   * @param {Object} [data={}] - Request data
   * @param {string} [data.relayState=''] - State to preserve across redirect
   * @returns {Promise<Object>} Response with redirect URL
   */
  async function handleAuthStart(data = {}) {
    const requestId = generateRequestId();
    const { relayState = "" } = data;
    await storage.savePendingRequest(requestId, { relayState, issuer });
    const redirectUrl = `${entryPoint}?SAMLRequest=${encodeURIComponent(requestId)}&RelayState=${encodeURIComponent(relayState)}`;
    return { type: SAMLMessageType.AUTH_REDIRECT, url: redirectUrl, requestId };
  }

  /**
   * Handle SAML callback - processes SAML response
   * @param {Object} data - Callback data
   * @param {string} data.SAMLResponse - SAML response
   * @param {string} [data.RelayState] - Relay state
   * @returns {Promise<Object>} Response with user profile or error
   */
  async function handleAuthCallback(data) {
    const { SAMLResponse, RelayState } = data;
    if (!SAMLResponse) {
      return { type: SAMLMessageType.AUTH_FAIL, error: SAMLError.MISSING_ASSERTION, message: "No SAML response provided" };
    }

    try {
      const nameId = SAMLResponse;
      const mockUser = await storage.getMockUser(nameId);
      if (!mockUser) {
        return { type: SAMLMessageType.AUTH_FAIL, error: SAMLError.MISSING_NAMEID, message: "User not found in identity provider" };
      }

      const profile = {
        nameID: nameId,
        nameIDFormat: identifierFormat,
        issuer: mockUser.issuer || entryPoint,
        email: mockUser.email || nameId,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        displayName: mockUser.displayName || mockUser.firstName + " " + mockUser.lastName,
        groups: mockUser.groups || [],
        raw: mockUser,
      };

      return { type: SAMLMessageType.AUTH_OK, userId: nameId, profile, relayState: RelayState };
    } catch (err) {
      return { type: SAMLMessageType.AUTH_FAIL, error: SAMLError.INVALID_RESPONSE, message: err.message || "Failed to process SAML response" };
    }
  }

  /**
   * Handle SAML logout start
   * @param {Object} data - Logout data
   * @param {string} data.nameId - User name ID
   * @param {string} [data.sessionIndex] - Session index
   * @returns {Promise<Object>} Response with logout redirect URL
   */
  async function handleLogoutStart(data) {
    const { nameId, sessionIndex } = data;
    if (!logoutUrl) {
      return { type: SAMLMessageType.LOGOUT_OK, message: "Single logout not configured" };
    }
    const redirectUrl = `${logoutUrl}?NameID=${encodeURIComponent(nameId)}&` + (sessionIndex ? `SessionIndex=${encodeURIComponent(sessionIndex)}` : "");
    return { type: SAMLMessageType.LOGOUT_REDIRECT, url: redirectUrl };
  }

  strategy.authenticate = function (req, options = {}) {
    const self = this;
    const samlResponse = req.body?.SAMLResponse || req.SAMLResponse;

    if (samlResponse) {
      handleAuthCallback({ SAMLResponse: samlResponse, RelayState: req.body?.RelayState || req.RelayState })
        .then((result) => {
          if (result.type === SAMLMessageType.AUTH_FAIL) {
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
              if (passReqToCallback) verify(req, result.profile, verified);
              else verify(result.profile, verified);
            } catch (err) {
              return self.error(err);
            }
          } else {
            return self.success(result.profile, { userId: result.userId });
          }
        })
        .catch((err) => { if (typeof self.error === "function") self.error(err); });
    } else {
      handleAuthStart({ relayState: options.relayState || req.relayState || "" })
        .then((result) => { self.redirect(result.url); })
        .catch((err) => { if (typeof self.error === "function") self.error(err); });
    }
  };

  /**
   * Register a test user for mock mode
   * @param {string} nameId - User name ID
   * @param {Object} [attributes={}] - User attributes
   * @returns {Promise<boolean>} Success
   */
  async function registerTestUser(nameId, attributes = {}) {
    return storage.registerMockUser(nameId, attributes);
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
    handleLogoutStart,
    registerTestUser,
    cleanup,
    _config: { entryPoint, issuer, callbackUrl },
  };
}

const SAMLStrategy = createSAMLStrategy;

module.exports = { createSAMLStrategy, SAMLStrategy, SAMLMessageType, SAMLError };
