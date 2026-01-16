/**
 * Get total client count across all cluster servers
 *
 * @param {Object} options - Options
 * @param {Array} options.servers - Server array
 * @returns {number} Total connected clients
 *
 * @example
 * const total = getTotalClientCount({ servers })
 */
function getTotalClientCount({ servers }) {
  if (!Array.isArray(servers)) {
    throw new Error('getTotalClientCount: servers array required');
  }

  return servers.reduce((sum, server) => sum + (server.clientCount || 0), 0);
}

module.exports = getTotalClientCount;
