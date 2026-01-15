/**
 * @fileoverview Auth Framework Constants
 * @module server/security/auth/framework/constants
 */

"use strict";

/**
 * Auth message type prefixes for routing
 * @type {string[]}
 */
const AUTH_MESSAGE_PREFIXES = ["opaque_", "ldap_", "saml_", "oauth2_", "mfa_", "key_recovery_", "webauthn_", "totp_"];

/**
 * Check if a message type is an authentication message
 * @param {string} type - Message type
 * @returns {boolean} Whether this is an auth message
 */
function isAuthMessage(type) {
  if (!type) return false;
  return AUTH_MESSAGE_PREFIXES.some((prefix) => type.startsWith(prefix));
}

module.exports = {
  AUTH_MESSAGE_PREFIXES,
  isAuthMessage,
};
