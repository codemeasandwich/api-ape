const assertConnected = require('./assertConnected');

/**
 * Assert that all clients are connected
 *
 * @param {Object} options - Options
 * @param {Array<Object>} options.clients - Clients to check
 * @returns {void}
 */
function assertAllConnected({ clients }) {
  if (!Array.isArray(clients)) {
    throw new Error('assertAllConnected: clients array required');
  }

  for (let i = 0; i < clients.length; i++) {
    try {
      assertConnected({ client: clients[i] });
    } catch (err) {
      throw new Error(`assertAllConnected: client at index ${i} is not connected`);
    }
  }
}

module.exports = assertAllConnected;
