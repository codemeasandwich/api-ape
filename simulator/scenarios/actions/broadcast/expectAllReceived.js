const expectReceived = require('./expectReceived');

/**
 * Wait for all specified clients to receive a broadcast
 *
 * @param {Object} options - Options
 * @param {Object[]} options.clients - Clients that should all receive
 * @param {string} options.type - Message type
 * @param {number} [options.timeout=200] - Timeout per client (ms)
 * @returns {Promise<Array<Object>>} Array of received messages
 *
 * @example
 * const messages = await expectAllReceived({
 *   clients: [bob, charlie],
 *   type: 'announcement'
 * })
 */
async function expectAllReceived({ clients, type, timeout = 200 }) {
  if (!Array.isArray(clients)) {
    throw new Error('expectAllReceived: clients array required');
  }

  const promises = clients.map((client) =>
    expectReceived({ client, type, timeout })
  );

  return Promise.all(promises);
}

module.exports = expectAllReceived;
