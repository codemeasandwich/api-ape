/**
 * @file Share CRUD operations for IndexedDB
 */
'use strict';

const { STORE_SHARES } = require('./constants');
const { openDatabase } = require('./db');

/**
 * Save an encrypted S2 share
 * @param {string} userId - User identifier
 * @param {string} shareId - Share identifier
 * @param {Uint8Array|string} encryptedShare - Encrypted data
 * @param {number} [version] - Version number
 * @returns {Promise<void>}
 */
async function saveShare(userId, shareId, encryptedShare, version = 1) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required and must be a string');
  }
  if (!shareId || typeof shareId !== 'string') {
    throw new Error('shareId is required and must be a string');
  }
  if (!encryptedShare) {
    throw new Error('encryptedShare is required');
  }

  const shareData = encryptedShare instanceof Uint8Array
    ? btoa(String.fromCharCode(...encryptedShare))
    : encryptedShare;

  const now = Date.now();
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SHARES, 'readwrite');
    const store = tx.objectStore(STORE_SHARES);
    const index = store.index('userShare');

    const getRequest = index.get([userId, shareId]);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;

      if (existing) {
        existing.encryptedShare = shareData;
        existing.version = version;
        existing.updatedAt = now;
        store.put(existing);
      } else {
        store.add({
          userId,
          shareId,
          encryptedShare: shareData,
          version,
          createdAt: now,
          updatedAt: now
        });
      }
    };

    getRequest.onerror = () => reject(getRequest.error);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Get an encrypted S2 share
 * @param {string} userId - User identifier
 * @param {string} shareId - Share identifier
 * @returns {Promise<Object|null>}
 */
async function getShare(userId, shareId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required and must be a string');
  }
  if (!shareId || typeof shareId !== 'string') {
    throw new Error('shareId is required and must be a string');
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SHARES, 'readonly');
    const store = tx.objectStore(STORE_SHARES);
    const index = store.index('userShare');

    const request = index.get([userId, shareId]);

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        resolve({
          encryptedShare: result.encryptedShare,
          version: result.version,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt
        });
      } else {
        resolve(null);
      }
    };

    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Get all shares for a user
 * @param {string} userId - User identifier
 * @returns {Promise<Array>}
 */
async function getAllShares(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required and must be a string');
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SHARES, 'readonly');
    const store = tx.objectStore(STORE_SHARES);
    const index = store.index('userId');

    const request = index.getAll(userId);

    request.onsuccess = () => {
      const results = request.result.map(r => ({
        shareId: r.shareId,
        encryptedShare: r.encryptedShare,
        version: r.version,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }));
      resolve(results);
    };

    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete a specific share
 * @param {string} userId - User identifier
 * @param {string} shareId - Share identifier
 * @returns {Promise<boolean>}
 */
async function deleteShare(userId, shareId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required and must be a string');
  }
  if (!shareId || typeof shareId !== 'string') {
    throw new Error('shareId is required and must be a string');
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SHARES, 'readwrite');
    const store = tx.objectStore(STORE_SHARES);
    const index = store.index('userShare');

    const getRequest = index.get([userId, shareId]);
    let deleted = false;

    getRequest.onsuccess = () => {
      const result = getRequest.result;
      if (result) {
        store.delete(result.id);
        deleted = true;
      }
    };

    getRequest.onerror = () => reject(getRequest.error);
    tx.oncomplete = () => { db.close(); resolve(deleted); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Get share version
 * @param {string} userId - User identifier
 * @param {string} shareId - Share identifier
 * @returns {Promise<number|null>}
 */
async function getShareVersion(userId, shareId) {
  const share = await getShare(userId, shareId);
  return share ? share.version : null;
}

module.exports = {
  saveShare,
  getShare,
  getAllShares,
  deleteShare,
  getShareVersion,
};
