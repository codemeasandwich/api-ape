/**
 * Get the connection state of a client
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to check
 * @returns {string} State: 'connected', 'disconnected', 'connecting', etc.
 *
 * @example
 * const state = getState({ client })
 * // 'connected' or 'disconnected'
 */
function getState({ client }) {
  if (!client) {
    throw new Error('getState: client required');
  }

  return client.state || (client.connected ? 'connected' : 'disconnected');
}

module.exports = getState;
