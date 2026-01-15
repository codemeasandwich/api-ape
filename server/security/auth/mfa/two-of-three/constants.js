/**
 * @file Two-of-three message types, errors, and default configuration
 */
"use strict";

/**
 * Message types for two-of-three protocol
 * @enum {string}
 */
const TwoOfThreeMessageType = {
  ENROLLMENT_START: "key_recovery_enrollment_start",
  ENROLLMENT_CHALLENGE: "key_recovery_enrollment_challenge",
  ENROLLMENT_FINISH: "key_recovery_enrollment_finish",
  ENROLLMENT_OK: "key_recovery_enrollment_ok",
  ENROLLMENT_FAIL: "key_recovery_enrollment_fail",
  RECOVERY_START: "key_recovery_start",
  RECOVERY_SHARES: "key_recovery_shares",
  RECOVERY_COMPLETE: "key_recovery_complete",
  RECOVERY_OK: "key_recovery_ok",
  RECOVERY_FAIL: "key_recovery_fail",
  ROTATION_START: "key_recovery_rotation_start",
  ROTATION_OK: "key_recovery_rotation_ok",
  ROTATION_FAIL: "key_recovery_rotation_fail",
};

/**
 * Error codes for two-of-three operations
 * @enum {string}
 */
const TwoOfThreeError = {
  INSUFFICIENT_FACTORS: "INSUFFICIENT_FACTORS",
  INVALID_FACTOR: "INVALID_FACTOR",
  SHARE_DECRYPTION_FAILED: "SHARE_DECRYPTION_FAILED",
  RECONSTRUCTION_FAILED: "RECONSTRUCTION_FAILED",
  NOT_ENROLLED: "NOT_ENROLLED",
  ALREADY_ENROLLED: "ALREADY_ENROLLED",
  ENROLLMENT_EXPIRED: "ENROLLMENT_EXPIRED",
  INVALID_FLOW: "INVALID_FLOW",
  REVOKED_SHARE: "REVOKED_SHARE",
  INVALID_PROOF: "INVALID_PROOF",
  PENDING_ENROLLMENT: "PENDING_ENROLLMENT",
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  requiredFactors: 2,
  allowedFlows: ["oauth+totp", "oauth+webauthn", "webauthn+totp"],
  enrollmentTimeout: 300000,
  secretLength: 32,
};

module.exports = {
  TwoOfThreeMessageType,
  TwoOfThreeError,
  DEFAULT_CONFIG,
};
