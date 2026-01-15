const connect = require('./connect');
const disconnect = require('./disconnect');

/**
 * Disconnect and reconnect a client (creates new client)
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to reconnect
 * @param {Object} options.harness - Harness instance
 * @param {Object} options.server - Server to reconnect to
 * @param {Object} [options.clientOptions={}] - Options for new client
 * @returns {Promise<Object>} New connected client
 *
 * @example
 * const newClient = await reconnect({ client, harness, server })
 */
async function reconnect({ client, harness, server, clientOptions = {} }) {
  if (!client) {
    throw new Error('reconnect: client required');
  }
  if (!harness) {
    throw new Error('reconnect: harness required');
  }
  if (!server) {
    throw new Error('reconnect: server required');
  }

  await disconnect({ client });

  // Small delay to ensure disconnect processed
  await new Promise((r) => setTimeout(r, 10));

  return connect({ harness, server, clientOptions });
}

module.exports = reconnect;
