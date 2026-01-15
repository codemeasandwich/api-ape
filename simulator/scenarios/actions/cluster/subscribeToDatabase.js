/**
 * Subscribe to a database channel
 *
 * @param {Object} options - Options
 * @param {Object} options.db - FakeDatabase instance
 * @param {string} options.channel - Channel name
 * @param {Function} options.handler - Message handler
 * @returns {Function} Unsubscribe function
 *
 * @example
 * const unsubscribe = subscribeToDatabase({
 *   db,
 *   channel: 'broadcast',
 *   handler: (data) => console.log('Received:', data)
 * })
 * // Later: unsubscribe()
 */
function subscribeToDatabase({ db, channel, handler }) {
  if (!db) {
    throw new Error('subscribeToDatabase: db required');
  }
  if (!channel) {
    throw new Error('subscribeToDatabase: channel required');
  }
  if (typeof handler !== 'function') {
    throw new Error('subscribeToDatabase: handler function required');
  }

  return db.subscribe(channel, handler);
}

module.exports = subscribeToDatabase;
