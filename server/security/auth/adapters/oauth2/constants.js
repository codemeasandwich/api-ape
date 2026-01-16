/**
 * @fileoverview OAuth2 Constants
 * @module server/security/auth/adapters/oauth2/constants
 */

"use strict";

/**
 * OAuth2 message types
 * @enum {string}
 */
const OAuth2MessageType = {
  AUTH_START: "oauth2_auth_start",
  AUTH_REDIRECT: "oauth2_auth_redirect",
  AUTH_CALLBACK: "oauth2_callback",
  AUTH_OK: "oauth2_auth_ok",
  AUTH_FAIL: "oauth2_auth_fail",
  TOKEN_REFRESH: "oauth2_token_refresh",
  TOKEN_REFRESHED: "oauth2_token_refreshed",
};

/**
 * OAuth2 error codes
 * @enum {string}
 */
const OAuth2Error = {
  INVALID_CODE: "INVALID_CODE",
  INVALID_STATE: "INVALID_STATE",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  SCOPE_ERROR: "SCOPE_ERROR",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  CONFIG_ERROR: "CONFIG_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  MISSING_CODE: "MISSING_CODE",
};

module.exports = {
  OAuth2MessageType,
  OAuth2Error,
};
