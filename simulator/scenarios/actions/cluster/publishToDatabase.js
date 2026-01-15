/**
 * Publish a message through the shared database
 *
 * @param {Object} options - Options
 * @param {Object} options.db - FakeDatabase instance
 * @param {string} options.channel - Channel name
 * @param {any} options.data - Data to publish
 * @returns {Promise<void>}
 *
 * @example
 * await publishToDatabase({
 *   db,
 *   channel: 'broadcast',
 *   data: { type: 'message', payload: { text: 'hi' } }
 * })
 */
async function publishToDatabase({ db, channel, data }) {
  if (!db) {
    throw new Error('publishToDatabase: db required');
  }
  if (!channel) {
    throw new Error('publishToDatabase: channel required');
  }

  await db.publish(channel, data);
}

module.exports = publishToDatabase;
