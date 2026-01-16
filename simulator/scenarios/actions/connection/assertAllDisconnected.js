const assertDisconnected = require('./assertDisconnected');

/**
 * Assert that all clients are disconnected
 *
 * @param {Object} options - Options
 * @param {Array<Object>} options.clients - Clients to check
 * @returns {void}
 */
function assertAllDisconnected({ clients }) {
  if (!Array.isArray(clients)) {
    throw new Error('assertAllDisconnected: clients array required');
  }

  for (let i = 0; i < clients.length; i++) {
    try {
      assertDisconnected({ client: clients[i] });
    } catch (err) {
      throw new Error(`assertAllDisconnected: client at index ${i} is still connected`);
    }
  }
}

module.exports = assertAllDisconnected;
