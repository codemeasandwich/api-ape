/**
 * @file Ledger error factory functions
 */
"use strict";

const { LedgerError } = require("./constants");

/**
 * Create a user not found error
 * @param {string} userId - User identifier
 * @returns {Error}
 */
function userNotFound(userId) {
  const err = new Error(`User ${userId} not found`);
  err.code = LedgerError.USER_NOT_FOUND;
  return err;
}

/**
 * Create a share not found error
 * @param {string} shareId - Share identifier
 * @param {string} userId - User identifier
 * @returns {Error}
 */
function shareNotFound(shareId, userId) {
  const msg = userId
    ? `Share ${shareId} not found for user ${userId}`
    : `Share ${shareId} not found`;
  const err = new Error(msg);
  err.code = LedgerError.SHARE_NOT_FOUND;
  return err;
}

/**
 * Create a share revoked error
 * @param {string} shareId - Share identifier
 * @returns {Error}
 */
function shareRevoked(shareId) {
  const err = new Error(`Share ${shareId} has been revoked`);
  err.code = LedgerError.SHARE_REVOKED;
  return err;
}

/**
 * Create an already enrolled error
 * @param {string} userId - User identifier
 * @returns {Error}
 */
function alreadyEnrolled(userId) {
  const err = new Error(`User ${userId} is already enrolled in key recovery`);
  err.code = LedgerError.ALREADY_ENROLLED;
  return err;
}

/**
 * Create an invalid share ID error
 * @param {string} shareId - Share identifier
 * @returns {Error}
 */
function invalidShareId(shareId) {
  const err = new Error(`Invalid share ID: ${shareId}`);
  err.code = LedgerError.INVALID_SHARE_ID;
  return err;
}

module.exports = {
  userNotFound,
  shareNotFound,
  shareRevoked,
  alreadyEnrolled,
  invalidShareId,
};
