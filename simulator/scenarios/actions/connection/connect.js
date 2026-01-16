/**
 * Connect a client to a server
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Object} options.server - Server to connect to
 * @param {Object} [options.clientOptions={}] - Client options
 * @returns {Promise<Object>} Connected client
 *
 * @example
 * const client = await connect({ harness, server })
 */
async function connect({ harness, server, clientOptions = {} }) {
  if (!harness) {
    throw new Error('connect: harness required');
  }
  if (!server) {
    throw new Error('connect: server required');
  }

  const client = await harness.createClientForServer(server, clientOptions);
  return client;
}

module.exports = connect;
