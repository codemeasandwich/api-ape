/**
 * Clear all received messages from a client's buffer
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to clear
 * @returns {void}
 *
 * @example
 * clearReceived({ client })
 */
function clearReceived({ client }) {
  if (!client) {
    throw new Error('clearReceived: client required');
  }

  client.clearMessages();
}

module.exports = clearReceived;
