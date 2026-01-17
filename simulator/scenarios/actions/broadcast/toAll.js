/**
 * @file Send a message to all connected clients from the server
 *
 * Uses the server's clients map to send to each client.
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server instance with clients map
 * @param {string} options.type - Message type/event name
 * @param {any} options.data - Data payload to send
 * @returns {Promise<void>}
 *
 * @example
 * await toAll({
 *   server,
 *   type: 'announcement',
 *   data: { message: 'Server restarting in 5 minutes' }
 * })
 */
async function toAll({ server, type, data }) {
  if (!server) {
    throw new Error('toAll: server required');
  }
  if (!type) {
    throw new Error('toAll: type required');
  }

  // Use server's clients map to send to all
  const clients = server.clients || server._ape?.clients;
  if (clients && typeof clients.forEach === 'function') {
    clients.forEach((client) => {
      client.send(type, data);
    });
  } else {
    throw new Error('toAll: server does not have clients map');
  }

  // Give time for messages to propagate (instant in virtual env)
  await new Promise((r) => setImmediate(r));
}

module.exports = toAll;
