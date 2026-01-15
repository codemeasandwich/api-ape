const shutdownServer = require('./shutdownServer');

/**
 * Shut down all servers in the cluster
 *
 * @param {Object} options - Options
 * @param {Array} options.servers - Server array
 * @returns {Promise<void>}
 *
 * @example
 * await shutdownAll({ servers })
 */
async function shutdownAll({ servers }) {
  if (!Array.isArray(servers)) {
    throw new Error('shutdownAll: servers array required');
  }

  await Promise.all(
    servers.map((server) => shutdownServer({ server }))
  );
}

module.exports = shutdownAll;
