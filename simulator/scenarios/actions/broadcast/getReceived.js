/**
 * Get all received messages of a specific type from a client
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to query
 * @param {string} options.type - Message type to filter by
 * @returns {Array<Object>} Array of received messages
 *
 * @example
 * const chatMessages = getReceived({ client, type: 'chat' })
 */
function getReceived({ client, type }) {
  if (!client) {
    throw new Error('getReceived: client required');
  }

  if (type) {
    return client.getMessages(type) || [];
  }

  return client.receivedMessages || [];
}

module.exports = getReceived;
