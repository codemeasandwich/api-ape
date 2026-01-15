const expectNotReceived = require('./expectNotReceived');

/**
 * Wait for none of the specified clients to receive a broadcast
 *
 * @param {Object} options - Options
 * @param {Object[]} options.clients - Clients that should NOT receive
 * @param {string} options.type - Message type
 * @param {number} [options.timeout=50] - Wait time (ms)
 * @returns {Promise<void>}
 *
 * @example
 * await expectNoneReceived({
 *   clients: [alice], // sender
 *   type: 'message'
 * })
 */
async function expectNoneReceived({ clients, type, timeout = 50 }) {
  if (!Array.isArray(clients)) {
    throw new Error('expectNoneReceived: clients array required');
  }

  const promises = clients.map((client) =>
    expectNotReceived({ client, type, timeout })
  );

  await Promise.all(promises);
}

module.exports = expectNoneReceived;
