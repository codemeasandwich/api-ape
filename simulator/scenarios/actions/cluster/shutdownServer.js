/**
 * Shut down a single server in the cluster
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server to shut down
 * @returns {Promise<void>}
 *
 * @example
 * await shutdownServer({ server: servers[0] })
 */
async function shutdownServer({ server }) {
  if (!server) {
    throw new Error('shutdownServer: server required');
  }

  await server.close();
}

module.exports = shutdownServer;
