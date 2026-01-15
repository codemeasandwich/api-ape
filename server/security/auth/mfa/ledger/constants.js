/**
 * @file Ledger constants and enums
 */
"use strict";

/**
 * Message types for ledger operations
 * @enum {string}
 */
const LedgerMessageType = {
  SHARE_STORED: "ledger_share_stored",
  SHARE_UPDATED: "ledger_share_updated",
  SHARE_REVOKED: "ledger_share_revoked",
  SHARE_FETCHED: "ledger_share_fetched",
  LEDGER_ERROR: "ledger_error",
};

/**
 * Error codes for ledger operations
 * @enum {string}
 */
const LedgerError = {
  USER_NOT_FOUND: "USER_NOT_FOUND",
  SHARE_NOT_FOUND: "SHARE_NOT_FOUND",
  SHARE_REVOKED: "SHARE_REVOKED",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  STORAGE_ERROR: "STORAGE_ERROR",
  ALREADY_ENROLLED: "ALREADY_ENROLLED",
  INVALID_SHARE_ID: "INVALID_SHARE_ID",
  AUDIT_REQUIRED: "AUDIT_REQUIRED",
};

/**
 * Valid share identifiers
 * @enum {string}
 */
const ShareId = {
  S1: "S1",
  S2: "S2",
  S3: "S3",
};

/**
 * Factor types that gate each share
 * @enum {string}
 */
const FactorType = {
  OAUTH: "oauth",
  OPAQUE: "opaque",
  WEBAUTHN: "webauthn",
  TOTP: "totp",
  A2F: "a2f",
};

/**
 * Audit event types
 * @enum {string}
 */
const AuditEventType = {
  ENROLLMENT: "enrollment",
  SHARE_STORED: "share_stored",
  SHARE_FETCHED: "share_fetched",
  SHARE_ROTATED: "share_rotated",
  SHARE_REVOKED: "share_revoked",
  RECOVERY_STARTED: "recovery_started",
  RECOVERY_COMPLETED: "recovery_completed",
};

module.exports = {
  LedgerMessageType,
  LedgerError,
  ShareId,
  FactorType,
  AuditEventType,
};
