/**
 * @file Recovery constants and error codes
 */
"use strict";

const { ShareId } = require("../ledger");

/**
 * Message types for recovery operations
 * @enum {string}
 */
const RecoveryMessageType = {
  LOST_DEVICE_START: "recovery_lost_device_start",
  LOST_DEVICE_CHALLENGE: "recovery_lost_device_challenge",
  LOST_DEVICE_VERIFY: "recovery_lost_device_verify",
  LOST_DEVICE_COMPLETE: "recovery_lost_device_complete",
  REGENERATE_SHARE: "recovery_regenerate_share",
  RELINK_FACTOR: "recovery_relink_factor",
  RECOVERY_OK: "recovery_ok",
  RECOVERY_FAIL: "recovery_fail",
};

/**
 * Error codes for recovery operations
 * @enum {string}
 */
const RecoveryError = {
  RECONSTRUCTION_REQUIRED: "RECONSTRUCTION_REQUIRED",
  INSUFFICIENT_REMAINING_FACTORS: "INSUFFICIENT_REMAINING_FACTORS",
  FACTOR_VERIFICATION_FAILED: "FACTOR_VERIFICATION_FAILED",
  NEW_FACTOR_REQUIRED: "NEW_FACTOR_REQUIRED",
  INVALID_LOST_FACTOR: "INVALID_LOST_FACTOR",
  RECOVERY_IN_PROGRESS: "RECOVERY_IN_PROGRESS",
  NO_PENDING_RECOVERY: "NO_PENDING_RECOVERY",
  NOT_ENROLLED: "NOT_ENROLLED",
};

/**
 * Maps lost factor to required remaining factors
 */
const RECOVERY_REQUIREMENTS = {
  [ShareId.S1]: {
    requiredFactors: [ShareId.S2, ShareId.S3],
    description: "WebAuthn + TOTP verification required",
  },
  [ShareId.S2]: {
    requiredFactors: [ShareId.S1, ShareId.S3],
    description: "OAuth + TOTP verification required",
  },
  [ShareId.S3]: {
    requiredFactors: [ShareId.S1, ShareId.S2],
    description: "OAuth + WebAuthn verification required",
  },
};

const DEFAULT_RECOVERY_CONFIG = {
  recoveryTimeout: 600000,
  requireProofOfPossession: true,
  auditAllRecoveries: true,
};

module.exports = {
  RecoveryMessageType,
  RecoveryError,
  RECOVERY_REQUIREMENTS,
  DEFAULT_RECOVERY_CONFIG,
};
