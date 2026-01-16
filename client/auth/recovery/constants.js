/**
 * @file Key recovery error codes and factor types
 */
'use strict';

/**
 * Error codes for key recovery operations
 * @enum {string}
 */
const KeyRecoveryError = {
  NOT_ENROLLED: 'NOT_ENROLLED',
  ALREADY_ENROLLED: 'ALREADY_ENROLLED',
  INSUFFICIENT_FACTORS: 'INSUFFICIENT_FACTORS',
  INVALID_FACTOR: 'INVALID_FACTOR',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  RECONSTRUCTION_FAILED: 'RECONSTRUCTION_FAILED',
  SERVER_ERROR: 'SERVER_ERROR',
  WEBAUTHN_FAILED: 'WEBAUTHN_FAILED',
  SHARE_MISMATCH: 'SHARE_MISMATCH',
  PROOF_FAILED: 'PROOF_FAILED',
  STORAGE_ERROR: 'STORAGE_ERROR',
};

/**
 * Factor types for authentication
 * @enum {string}
 */
const FactorType = {
  OAUTH: 'oauth',
  WEBAUTHN: 'webauthn',
  TOTP: 'totp',
};

module.exports = {
  KeyRecoveryError,
  FactorType,
};
