/**
 * Get the number of connected clients on a server
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server to check
 * @returns {number} Client count
 *
 * @example
 * const count = getClientCount({ server })
 */
function getClientCount({ server }) {
  if (!server) {
    throw new Error('getClientCount: server required');
  }

  return server.clientCount || 0;
}

module.exports = getClientCount;
