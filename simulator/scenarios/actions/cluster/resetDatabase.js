/**
 * Reset all database state
 *
 * @param {Object} options - Options
 * @param {Object} options.db - FakeDatabase instance
 * @returns {void}
 *
 * @example
 * resetDatabase({ db })
 */
function resetDatabase({ db }) {
  if (!db) {
    throw new Error('resetDatabase: db required');
  }

  db.reset();
}

module.exports = resetDatabase;
