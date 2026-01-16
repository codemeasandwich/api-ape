/**
 * Get state of all servers in cluster
 *
 * @param {Object} options - Options
 * @param {Array} options.servers - Server array
 * @returns {Array<Object>} Array of server states
 *
 * @example
 * const states = getServerState({ servers })
 * // [{ port: 9000, clientCount: 5, closed: false }, ...]
 */
function getServerState({ servers }) {
  if (!Array.isArray(servers)) {
    throw new Error('getServerState: servers array required');
  }

  return servers.map((server) => ({
    port: server.port,
    url: server.url,
    clientCount: server.clientCount || 0,
    closed: server.closed || false,
  }));
}

module.exports = getServerState;
