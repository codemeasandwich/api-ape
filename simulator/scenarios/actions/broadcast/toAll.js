/**
 * Broadcast a message to all connected clients from the server
 *
 * Uses the server's broadcast() function directly.
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server instance with broadcast function
 * @param {string} options.type - Message type/event name
 * @param {any} options.data - Data payload to broadcast
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

  // Use server's broadcast function
  if (typeof server.broadcast === 'function') {
    server.broadcast(type, data);
  } else if (server._ape && typeof server._ape.broadcast === 'function') {
    server._ape.broadcast(type, data);
  } else {
    throw new Error('toAll: server does not have broadcast function');
  }

  // Give time for broadcast to propagate (instant in virtual env)
  await new Promise((r) => setImmediate(r));
}

module.exports = toAll;
