const disconnect = require('./disconnect');

/**
 * Disconnect multiple clients
 *
 * @param {Object} options - Options
 * @param {Array<Object>} options.clients - Clients to disconnect
 * @returns {Promise<void>}
 *
 * @example
 * await disconnectMany({ clients: [alice, bob, charlie] })
 */
async function disconnectMany({ clients }) {
  if (!Array.isArray(clients)) {
    throw new Error('disconnectMany: clients array required');
  }

  await Promise.all(
    clients.map((client) => disconnect({ client }))
  );
}

module.exports = disconnectMany;
