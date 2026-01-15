const isConnected = require('./isConnected');

/**
 * Assert that a client is connected
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to check
 * @returns {void}
 */
function assertConnected({ client }) {
  if (!isConnected({ client })) {
    throw new Error('assertConnected: client is not connected');
  }
}

module.exports = assertConnected;
