const connectToServer = require('./connectToServer');

/**
 * Distribute clients across cluster servers
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Array} options.servers - Server array
 * @param {number} options.clientsPerServer - Clients per server
 * @returns {Promise<Map<Object, Array<Object>>>} Map of server -> clients
 *
 * @example
 * const distribution = await distributeClients({
 *   harness,
 *   servers,
 *   clientsPerServer: 3
 * })
 * // distribution.get(servers[0]) => [client1, client2, client3]
 */
async function distributeClients({ harness, servers, clientsPerServer }) {
  if (!Array.isArray(servers)) {
    throw new Error('distributeClients: servers array required');
  }
  if (!clientsPerServer || clientsPerServer < 1) {
    throw new Error('distributeClients: clientsPerServer must be >= 1');
  }

  const distribution = new Map();

  for (const server of servers) {
    const clients = [];
    for (let i = 0; i < clientsPerServer; i++) {
      const client = await connectToServer({ harness, server });
      clients.push(client);
    }
    distribution.set(server, clients);
  }

  return distribution;
}

module.exports = distributeClients;
