const isConnected = require('./isConnected');

/**
 * Assert that a client is disconnected
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to check
 * @returns {void}
 */
function assertDisconnected({ client }) {
  if (isConnected({ client })) {
    throw new Error('assertDisconnected: client is still connected');
  }
}

module.exports = assertDisconnected;
