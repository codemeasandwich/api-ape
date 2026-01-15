/**
 * Connect a client to a specific server in the cluster
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Object} options.server - Server to connect to
 * @param {Object} [options.clientOptions={}] - Client options
 * @returns {Promise<Object>} Connected client
 *
 * @example
 * const client = await connectToServer({
 *   harness,
 *   server: servers[0]
 * })
 */
async function connectToServer({ harness, server, clientOptions = {} }) {
  if (!harness) {
    throw new Error('connectToServer: harness required');
  }
  if (!server) {
    throw new Error('connectToServer: server required');
  }

  const client = await harness.createClientForServer(server, clientOptions);
  return client;
}

module.exports = connectToServer;
