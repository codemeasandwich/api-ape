/**
 * @file Wrapped key CRUD operations for IndexedDB
 */
'use strict';

const { STORE_KEYS } = require('./constants');
const { openDatabase } = require('./db');

/**
 * Save a wrapped L_key
 * @param {string} userId - User identifier
 * @param {string} keyId - Key identifier
 * @param {Uint8Array|string} wrappedKey - Wrapped key data
 * @returns {Promise<void>}
 */
async function saveWrappedKey(userId, keyId, wrappedKey) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required and must be a string');
  }
  if (!keyId || typeof keyId !== 'string') {
    throw new Error('keyId is required and must be a string');
  }
  if (!wrappedKey) {
    throw new Error('wrappedKey is required');
  }

  const keyData = wrappedKey instanceof Uint8Array
    ? btoa(String.fromCharCode(...wrappedKey))
    : wrappedKey;

  const now = Date.now();
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, 'readwrite');
    const store = tx.objectStore(STORE_KEYS);
    const index = store.index('keyId');

    const getRequest = index.get(keyId);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;

      if (existing) {
        existing.wrappedKey = keyData;
        existing.userId = userId;
        store.put(existing);
      } else {
        store.add({
          userId,
          keyId,
          wrappedKey: keyData,
          createdAt: now
        });
      }
    };

    getRequest.onerror = () => reject(getRequest.error);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Get a wrapped L_key by keyId
 * @param {string} keyId - Key identifier
 * @returns {Promise<Object|null>}
 */
async function getWrappedKey(keyId) {
  if (!keyId || typeof keyId !== 'string') {
    throw new Error('keyId is required and must be a string');
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, 'readonly');
    const store = tx.objectStore(STORE_KEYS);
    const index = store.index('keyId');

    const request = index.get(keyId);

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        resolve({
          wrappedKey: result.wrappedKey,
          userId: result.userId,
          createdAt: result.createdAt
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
 * Get all wrapped keys for a user
 * @param {string} userId - User identifier
 * @returns {Promise<Array>}
 */
async function getAllWrappedKeys(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required and must be a string');
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, 'readonly');
    const store = tx.objectStore(STORE_KEYS);
    const index = store.index('userId');

    const request = index.getAll(userId);

    request.onsuccess = () => {
      const results = request.result.map(r => ({
        keyId: r.keyId,
        wrappedKey: r.wrappedKey,
        createdAt: r.createdAt
      }));
      resolve(results);
    };

    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete a wrapped key
 * @param {string} keyId - Key identifier
 * @returns {Promise<boolean>}
 */
async function deleteWrappedKey(keyId) {
  if (!keyId || typeof keyId !== 'string') {
    throw new Error('keyId is required and must be a string');
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, 'readwrite');
    const store = tx.objectStore(STORE_KEYS);
    const index = store.index('keyId');

    const getRequest = index.get(keyId);
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

module.exports = {
  saveWrappedKey,
  getWrappedKey,
  getAllWrappedKeys,
  deleteWrappedKey,
};
