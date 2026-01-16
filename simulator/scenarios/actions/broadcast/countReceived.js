const getReceived = require('./getReceived');

/**
 * Count total broadcasts received across all clients
 *
 * @param {Object} options - Options
 * @param {Object[]} options.clients - Clients to count
 * @param {string} [options.type] - Optional type filter
 * @returns {number} Total message count
 *
 * @example
 * const total = countReceived({ clients: [alice, bob], type: 'chat' })
 */
function countReceived({ clients, type }) {
  if (!Array.isArray(clients)) {
    throw new Error('countReceived: clients array required');
  }

  return clients.reduce((sum, client) => {
    const messages = getReceived({ client, type });
    return sum + messages.length;
  }, 0);
}

module.exports = countReceived;
