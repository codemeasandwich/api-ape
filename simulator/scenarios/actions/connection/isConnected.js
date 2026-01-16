/**
 * Check if a client is currently connected
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to check
 * @returns {boolean} True if connected
 *
 * @example
 * if (isConnected({ client })) {
 *   // do something
 * }
 */
function isConnected({ client }) {
  if (!client) {
    throw new Error('isConnected: client required');
  }

  return client.connected === true;
}

module.exports = isConnected;
