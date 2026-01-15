/**
 * @fileoverview Ledger for Share Versioning and Revocation
 *
 * Manages encrypted share storage, versioning, and revocation tracking.
 *
 * @module server/security/auth/mfa/ledger
 */

"use strict";

const { LedgerMessageType, LedgerError, ShareId, FactorType, AuditEventType } = require("./ledger/constants");
const { createShareRecord } = require("./ledger/share-record");
const errors = require("./ledger/errors");

/**
 * Create a ledger instance for share management
 *
 * @param {Object} config - Ledger configuration
 * @param {Function} config.getRecord - Async fn(userId) => UserRecord or null
 * @param {Function} config.saveRecord - Async fn(userId, record) => void
 * @param {Function} config.deleteRecord - Async fn(userId) => void
 * @param {boolean} config.auditEnabled - Enable audit logging
 * @param {Function} config.onAuditEvent - Audit event callback fn(event)
 * @returns {Object} Ledger instance
 */
function createLedger(config = {}) {
  const { getRecord: _getRecord, saveRecord: _saveRecord, deleteRecord: _deleteRecord, auditEnabled = true, onAuditEvent } = config;
  const _defaultStore = new Map();
  const getRecord = _getRecord || (async (userId) => _defaultStore.get(userId) || null);
  const saveRecord = _saveRecord || (async (userId, record) => _defaultStore.set(userId, record));
  const deleteRecord = _deleteRecord || (async (userId) => _defaultStore.delete(userId));

  /**
   * Log an audit event
   * @param {string} eventType - Event type
   * @param {string} userId - User ID
   * @param {Object} details - Event details
   * @returns {void}
   */
  function logAudit(eventType, userId, details = {}) {
    if (auditEnabled && onAuditEvent) onAuditEvent({ type: eventType, userId, timestamp: Date.now(), ...details });
  }

  /**
   * Check if user is enrolled in key recovery
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if enrolled
   */
  async function isEnrolled(userId) {
    const record = await getRecord(userId);
    return record !== null && record.shares && Object.keys(record.shares).length > 0;
  }

  /**
   * Store encrypted shares for a user
   * @param {string} userId - User ID
   * @param {Object} shares - Share data keyed by share ID
   * @param {Object} options - Storage options
   * @returns {Promise<Object>} Storage result
   */
  async function storeShares(userId, shares, options = {}) {
    if (await isEnrolled(userId)) throw errors.alreadyEnrolled(userId);
    for (const shareId of Object.keys(shares)) {
      if (!Object.values(ShareId).includes(shareId)) throw errors.invalidShareId(shareId);
    }

    const record = {
      userId, enrolledAt: Date.now(),
      proofHash: options.proofHash ? options.proofHash.toString("base64") : null,
      shares: {},
    };
    for (const [shareId, info] of Object.entries(shares)) {
      record.shares[shareId] = createShareRecord(shareId, info.factor, info.data, 1);
    }
    if (!record.shares[ShareId.S2]) {
      record.shares[ShareId.S2] = createShareRecord(ShareId.S2, FactorType.WEBAUTHN, null, 1);
    }
    await saveRecord(userId, record);
    logAudit(AuditEventType.ENROLLMENT, userId, { shareIds: Object.keys(record.shares) });

    return {
      type: LedgerMessageType.SHARE_STORED, userId,
      shares: Object.keys(record.shares).reduce((a, id) => { a[id] = { version: record.shares[id].version }; return a; }, {}),
    };
  }

  /**
   * Fetch encrypted shares for a user
   * @param {string} userId - User ID
   * @param {string[]|null} shareIds - Share IDs to fetch (null for all)
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Fetched shares and metadata
   */
  async function fetchShares(userId, shareIds = null, options = {}) {
    const record = await getRecord(userId);
    if (!record) throw errors.userNotFound(userId);

    const requestedIds = shareIds || Object.keys(record.shares);
    const result = { type: LedgerMessageType.SHARE_FETCHED, userId, shares: {}, metadata: {} };

    for (const shareId of requestedIds) {
      const share = record.shares[shareId];
      if (!share) throw errors.shareNotFound(shareId, userId);
      if (share.revoked && !options.includeRevoked) throw errors.shareRevoked(shareId);
      if (share.encryptedData) result.shares[shareId] = Buffer.from(share.encryptedData, "base64");
      result.metadata[shareId] = {
        version: share.version, factor: share.factor, revoked: share.revoked,
        createdAt: share.createdAt, revokedAt: share.revokedAt, revokedReason: share.revokedReason,
      };
    }
    logAudit(AuditEventType.SHARE_FETCHED, userId, { shareIds: requestedIds });
    return result;
  }

  /**
   * Revoke a share
   * @param {string} userId - User ID
   * @param {string} shareId - Share ID to revoke
   * @param {string} reason - Revocation reason
   * @returns {Promise<Object>} Revocation result
   */
  async function revokeShare(userId, shareId, reason) {
    const record = await getRecord(userId);
    if (!record) throw errors.userNotFound(userId);
    const share = record.shares[shareId];
    if (!share) throw errors.shareNotFound(shareId, userId);

    share.revoked = true;
    share.revokedAt = Date.now();
    share.revokedReason = reason;
    await saveRecord(userId, record);
    logAudit(AuditEventType.SHARE_REVOKED, userId, { shareId, reason });

    return { type: LedgerMessageType.SHARE_REVOKED, userId, shareId, version: share.version, revokedAt: share.revokedAt };
  }

  /**
   * Rotate a share with new data
   * @param {string} userId - User ID
   * @param {string} shareId - Share ID to rotate
   * @param {Object} newShareInfo - New share info
   * @param {string} reason - Rotation reason
   * @returns {Promise<Object>} Rotation result
   */
  async function rotateShare(userId, shareId, newShareInfo, reason = "rotation") {
    const record = await getRecord(userId);
    if (!record) throw errors.userNotFound(userId);
    const oldShare = record.shares[shareId];
    if (!oldShare) throw errors.shareNotFound(shareId, userId);

    oldShare.revoked = true;
    oldShare.revokedAt = Date.now();
    oldShare.revokedReason = reason;
    const newVersion = oldShare.version + 1;
    record.shares[shareId] = createShareRecord(shareId, newShareInfo.factor || oldShare.factor, newShareInfo.data, newVersion);
    await saveRecord(userId, record);
    logAudit(AuditEventType.SHARE_ROTATED, userId, { shareId, oldVersion: oldShare.version, newVersion, reason });

    return { type: LedgerMessageType.SHARE_UPDATED, userId, shareId, oldVersion: oldShare.version, newVersion };
  }

  /**
   * Get share versions for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Share versions
   */
  async function getVersions(userId) {
    const record = await getRecord(userId);
    if (!record) throw errors.userNotFound(userId);
    const versions = {};
    for (const [shareId, share] of Object.entries(record.shares)) {
      versions[shareId] = { version: share.version, revoked: share.revoked, factor: share.factor };
    }
    return versions;
  }

  /**
   * Get proof hash for a user
   * @param {string} userId - User ID
   * @returns {Promise<Buffer|null>} Proof hash or null
   */
  async function getProofHash(userId) {
    const record = await getRecord(userId);
    return record?.proofHash ? Buffer.from(record.proofHash, "base64") : null;
  }

  /**
   * Update proof hash for a user
   * @param {string} userId - User ID
   * @param {Buffer} proofHash - New proof hash
   * @returns {Promise<void>}
   */
  async function updateProofHash(userId, proofHash) {
    const record = await getRecord(userId);
    if (!record) throw errors.userNotFound(userId);
    record.proofHash = proofHash.toString("base64");
    await saveRecord(userId, record);
  }

  /**
   * Delete all shares for a user
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async function deleteAllShares(userId) {
    const record = await getRecord(userId);
    if (!record) throw errors.userNotFound(userId);
    await deleteRecord(userId);
    logAudit(AuditEventType.SHARE_REVOKED, userId, { shareId: "ALL", reason: "unenrollment" });
  }

  /**
   * Get metadata for a specific share
   * @param {string} userId - User ID
   * @param {string} shareId - Share ID
   * @returns {Promise<Object>} Share metadata
   */
  async function getShareMetadata(userId, shareId) {
    const record = await getRecord(userId);
    if (!record) throw errors.userNotFound(userId);
    const share = record.shares[shareId];
    if (!share) throw errors.shareNotFound(shareId);
    return {
      shareId: share.shareId, factor: share.factor, version: share.version, revoked: share.revoked,
      createdAt: share.createdAt, revokedAt: share.revokedAt, revokedReason: share.revokedReason,
      hasData: share.encryptedData !== null,
    };
  }

  /**
   * Update S2 share metadata (client-stored share)
   * @param {string} userId - User ID
   * @param {number} newVersion - New version number
   * @returns {Promise<Object>} Update result
   */
  async function updateS2Metadata(userId, newVersion) {
    const record = await getRecord(userId);
    if (!record) throw errors.userNotFound(userId);
    const s2 = record.shares[ShareId.S2];
    if (!s2) throw errors.shareNotFound("S2 metadata");
    const oldVersion = s2.version;
    Object.assign(s2, { version: newVersion, createdAt: Date.now(), revoked: false, revokedAt: null, revokedReason: null });
    await saveRecord(userId, record);
    logAudit(AuditEventType.SHARE_ROTATED, userId, { shareId: ShareId.S2, oldVersion, newVersion, reason: "client_rotation" });
    return { type: LedgerMessageType.SHARE_UPDATED, userId, shareId: ShareId.S2, oldVersion, newVersion };
  }

  return {
    isEnrolled, storeShares, fetchShares, revokeShare, rotateShare, getVersions, deleteAllShares,
    getProofHash, updateProofHash, getShareMetadata, updateS2Metadata,
    MessageType: LedgerMessageType, Error: LedgerError, ShareId, FactorType, AuditEventType, _defaultStore,
  };
}

module.exports = { createLedger, createShareRecord, LedgerMessageType, LedgerError, ShareId, FactorType, AuditEventType };
