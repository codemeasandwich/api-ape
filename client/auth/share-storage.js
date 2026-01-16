/**
 * @file IndexedDB Storage for S2 Share (WebAuthn-gated)
 *
 * Stores the encrypted S2 share and wrapped L_key locally in the browser.
 * S2 is encrypted with L_key, which is derived from WebAuthn authenticator data.
 *
 * @module client/auth/share-storage
 */
'use strict';

const {
  DB_NAME,
  DB_VERSION,
  STORE_SHARES,
  STORE_KEYS,
  STORE_METADATA,
} = require('./storage/constants');

const { openDatabase, clearDatabase } = require('./storage/db');

const {
  saveShare,
  getShare,
  getAllShares,
  deleteShare,
  getShareVersion,
} = require('./storage/shares');

const {
  saveWrappedKey,
  getWrappedKey,
  getAllWrappedKeys,
  deleteWrappedKey,
} = require('./storage/keys');

/**
 * Save enrollment metadata for a user
 * @param {string} userId - User identifier
 * @param {Object} [metadata] - Enrollment metadata
 * @returns {Promise<void>}
 */
async function saveMetadata(userId, metadata = {}) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required and must be a string');
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METADATA, 'readwrite');
    const store = tx.objectStore(STORE_METADATA);

    const now = Date.now();
    const record = {
      userId,
      enrolledAt: metadata.enrolledAt || now,
      lastRecoveryAt: metadata.lastRecoveryAt || null,
      shareCount: metadata.shareCount || 0,
      ...metadata,
      updatedAt: now
    };

    store.put(record);

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Get enrollment metadata for a user
 * @param {string} userId - User identifier
 * @returns {Promise<Object|null>}
 */
async function getMetadata(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required and must be a string');
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METADATA, 'readonly');
    const store = tx.objectStore(STORE_METADATA);

    const request = store.get(userId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete all data for a user
 * @param {string} userId - User identifier
 * @returns {Promise<Object>} Count of deleted items
 */
async function deleteAllUserData(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required and must be a string');
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SHARES, STORE_KEYS, STORE_METADATA], 'readwrite');

    let sharesDeleted = 0;
    let keysDeleted = 0;

    const sharesStore = tx.objectStore(STORE_SHARES);
    const sharesIndex = sharesStore.index('userId');
    const sharesCursor = sharesIndex.openCursor(userId);

    sharesCursor.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        sharesStore.delete(cursor.primaryKey);
        sharesDeleted++;
        cursor.continue();
      }
    };

    const keysStore = tx.objectStore(STORE_KEYS);
    const keysIndex = keysStore.index('userId');
    const keysCursor = keysIndex.openCursor(userId);

    keysCursor.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        keysStore.delete(cursor.primaryKey);
        keysDeleted++;
        cursor.continue();
      }
    };

    const metadataStore = tx.objectStore(STORE_METADATA);
    metadataStore.delete(userId);

    tx.oncomplete = () => { db.close(); resolve({ shares: sharesDeleted, keys: keysDeleted }); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Check if a user has enrolled
 * @param {string} userId - User identifier
 * @returns {Promise<boolean>}
 */
async function isEnrolled(userId) {
  const metadata = await getMetadata(userId);
  return metadata !== null && metadata.enrolledAt !== undefined;
}

/**
 * Create a storage instance with bound userId
 * @param {string} userId - User identifier
 * @returns {Object} Storage API bound to userId
 */
function createUserStorage(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required and must be a string');
  }

  return {
    userId,
    saveShare: (shareId, encryptedShare, version) => saveShare(userId, shareId, encryptedShare, version),
    getShare: (shareId) => getShare(userId, shareId),
    getAllShares: () => getAllShares(userId),
    deleteShare: (shareId) => deleteShare(userId, shareId),
    getShareVersion: (shareId) => getShareVersion(userId, shareId),
    saveWrappedKey: (keyId, wrappedKey) => saveWrappedKey(userId, keyId, wrappedKey),
    getAllWrappedKeys: () => getAllWrappedKeys(userId),
    saveMetadata: (metadata) => saveMetadata(userId, metadata),
    getMetadata: () => getMetadata(userId),
    isEnrolled: () => isEnrolled(userId),
    deleteAll: () => deleteAllUserData(userId)
  };
}

module.exports = {
  openDatabase,
  clearDatabase,
  saveShare,
  getShare,
  getAllShares,
  deleteShare,
  getShareVersion,
  saveWrappedKey,
  getWrappedKey,
  getAllWrappedKeys,
  deleteWrappedKey,
  saveMetadata,
  getMetadata,
  deleteAllUserData,
  isEnrolled,
  createUserStorage,
  DB_NAME,
  DB_VERSION,
  STORE_SHARES,
  STORE_KEYS,
  STORE_METADATA
};
