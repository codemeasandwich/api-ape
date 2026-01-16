/**
 * @fileoverview LDAP Constants
 * @module server/security/auth/adapters/ldap/constants
 */

"use strict";

/**
 * LDAP message types
 * @enum {string}
 */
const LDAPMessageType = {
  AUTH: "ldap_auth",
  AUTH_OK: "ldap_auth_ok",
  AUTH_FAIL: "ldap_auth_fail",
};

/**
 * LDAP error codes
 * @enum {string}
 */
const LDAPError = {
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  CONNECTION_ERROR: "CONNECTION_ERROR",
  BIND_ERROR: "BIND_ERROR",
  SEARCH_ERROR: "SEARCH_ERROR",
  TIMEOUT: "TIMEOUT",
  TLS_ERROR: "TLS_ERROR",
  MISSING_CREDENTIALS: "MISSING_CREDENTIALS",
  SERVER_UNAVAILABLE: "SERVER_UNAVAILABLE",
};

module.exports = {
  LDAPMessageType,
  LDAPError,
};
