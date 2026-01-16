/**
 * Create a cluster of servers sharing a database
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {number} options.count - Number of servers to create
 * @param {Object} [options.serverOptions={}] - Options passed to each server
 * @returns {Promise<{servers: Array, db: Object}>} Created servers and shared database
 *
 * @example
 * const { servers, db } = await createCluster({
 *   harness,
 *   count: 3,
 *   serverOptions: { where: 'test-api' }
 * })
 */
async function createCluster({ harness, count, serverOptions = {} }) {
  if (!harness) {
    throw new Error('createCluster: harness required');
  }
  if (!count || count < 1) {
    throw new Error('createCluster: count must be >= 1');
  }

  const servers = await harness.createCluster(count, serverOptions);
  const db = harness.db;

  return { servers, db };
}

module.exports = createCluster;
