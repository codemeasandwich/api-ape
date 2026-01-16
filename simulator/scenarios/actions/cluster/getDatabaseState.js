/**
 * Get state of the shared database
 *
 * @param {Object} options - Options
 * @param {Object} options.db - FakeDatabase instance
 * @returns {Object} Database state
 *
 * @example
 * const state = getDatabaseState({ db })
 * // { activeServers: ['server-1'], clientCount: 5 }
 */
function getDatabaseState({ db }) {
  if (!db) {
    throw new Error('getDatabaseState: db required');
  }

  return db.getState();
}

module.exports = getDatabaseState;
