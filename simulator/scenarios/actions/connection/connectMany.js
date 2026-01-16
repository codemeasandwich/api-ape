const connect = require('./connect');

/**
 * Connect multiple clients to a server
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Object} options.server - Server to connect to
 * @param {number} options.count - Number of clients
 * @param {Object} [options.clientOptions={}] - Client options
 * @returns {Promise<Array<Object>>} Array of connected clients
 *
 * @example
 * const clients = await connectMany({ harness, server, count: 5 })
 */
async function connectMany({ harness, server, count, clientOptions = {} }) {
  if (!count || count < 1) {
    throw new Error('connectMany: count must be >= 1');
  }

  const clients = [];
  for (let i = 0; i < count; i++) {
    const client = await connect({ harness, server, clientOptions });
    clients.push(client);
  }
  return clients;
}

module.exports = connectMany;
