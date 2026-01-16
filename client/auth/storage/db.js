/**
 * @file IndexedDB database initialization and transaction helpers
 */
'use strict';

const {
  DB_NAME,
  DB_VERSION,
  STORE_SHARES,
  STORE_KEYS,
  STORE_METADATA,
} = require('./constants');

/**
 * Open the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error?.message || 'Unknown error'}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_SHARES)) {
        const sharesStore = db.createObjectStore(STORE_SHARES, { keyPath: 'id', autoIncrement: true });
        sharesStore.createIndex('userId', 'userId', { unique: false });
        sharesStore.createIndex('shareId', 'shareId', { unique: true });
        sharesStore.createIndex('userShare', ['userId', 'shareId'], { unique: true });
      }

      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        const keysStore = db.createObjectStore(STORE_KEYS, { keyPath: 'id', autoIncrement: true });
        keysStore.createIndex('userId', 'userId', { unique: false });
        keysStore.createIndex('keyId', 'keyId', { unique: true });
      }

      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: 'userId' });
      }
    };
  });
}

/**
 * Execute a transaction on the database
 * @param {string|Array} storeNames - Store name(s)
 * @param {string} mode - Transaction mode
 * @param {Function} operation - Operation function
 * @returns {Promise<*>}
 */
async function withTransaction(storeNames, mode, operation) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);

    tx.onerror = () => {
      reject(new Error(`Transaction failed: ${tx.error?.message || 'Unknown error'}`));
    };

    tx.oncomplete = () => {
      db.close();
    };

    try {
      const result = operation(tx);

      if (result && typeof result.then === 'function') {
        result.then(resolve).catch(reject);
      } else {
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Wrap an IDBRequest in a Promise
 * @param {IDBRequest} request - Request to wrap
 * @returns {Promise<*>}
 */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear the entire database
 * @returns {Promise<void>}
 */
function clearDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion blocked'));
  });
}

module.exports = {
  openDatabase,
  withTransaction,
  promisifyRequest,
  clearDatabase,
};
