/**
 * @file SAML constants and error codes
 */
"use strict";

/**
 * SAML message types
 * @enum {string}
 */
const SAMLMessageType = {
  AUTH_START: "saml_auth_start",
  AUTH_REDIRECT: "saml_auth_redirect",
  AUTH_CALLBACK: "saml_auth_callback",
  AUTH_OK: "saml_auth_ok",
  AUTH_FAIL: "saml_auth_fail",
  LOGOUT_START: "saml_logout_start",
  LOGOUT_REDIRECT: "saml_logout_redirect",
  LOGOUT_OK: "saml_logout_ok",
};

/**
 * SAML error codes
 * @enum {string}
 */
const SAMLError = {
  INVALID_RESPONSE: "INVALID_RESPONSE",
  SIGNATURE_INVALID: "SIGNATURE_INVALID",
  ASSERTION_EXPIRED: "ASSERTION_EXPIRED",
  MISSING_ASSERTION: "MISSING_ASSERTION",
  INVALID_AUDIENCE: "INVALID_AUDIENCE",
  MISSING_NAMEID: "MISSING_NAMEID",
  IDP_ERROR: "IDP_ERROR",
  CONFIG_ERROR: "CONFIG_ERROR",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
};

/**
 * Default attribute mapping
 */
const DEFAULT_ATTRIBUTE_MAPPING = {
  email: ["email", "urn:oid:0.9.2342.19200300.100.1.3", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"],
  displayName: ["displayName", "cn", "urn:oid:2.16.840.1.113730.3.1.241", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"],
  firstName: ["firstName", "givenName", "urn:oid:2.5.4.42", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"],
  lastName: ["lastName", "sn", "surname", "urn:oid:2.5.4.4", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"],
  groups: ["memberOf", "groups", "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"],
};

module.exports = {
  SAMLMessageType,
  SAMLError,
  DEFAULT_ATTRIBUTE_MAPPING,
};
