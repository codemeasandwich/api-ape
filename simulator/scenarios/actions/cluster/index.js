/**
 * @fileoverview Cluster Actions - Atomic operations for multi-server testing
 *
 * These actions handle Forest clustering functionality through api-ape's public interface.
 * Forest enables multiple servers to share state via a database (Redis in production,
 * FakeDatabase in tests).
 *
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/cluster
 *
 * @example
 * const cluster = require('../actions/cluster')
 *
 * // Create a cluster
 * const { servers, db } = await cluster.createCluster({
 *   harness,
 *   count: 3,
 *   serverOptions: { where: 'test-api' }
 * })
 *
 * // Distribute clients
 * const distribution = await cluster.distributeClients({
 *   harness,
 *   servers,
 *   clientsPerServer: 2
 * })
 */

module.exports = {
  // Cluster creation
  createCluster: require('./createCluster'),

  // Client management
  connectToServer: require('./connectToServer'),
  distributeClients: require('./distributeClients'),

  // State queries
  getTotalClientCount: require('./getTotalClientCount'),
  getServerState: require('./getServerState'),
  getDatabaseState: require('./getDatabaseState'),

  // Lifecycle
  shutdownServer: require('./shutdownServer'),
  shutdownAll: require('./shutdownAll'),

  // Database operations
  publishToDatabase: require('./publishToDatabase'),
  subscribeToDatabase: require('./subscribeToDatabase'),
  resetDatabase: require('./resetDatabase'),
  waitForDatabaseSync: require('./waitForDatabaseSync'),

  // Assertions
  assertServerCount: require('./assertServerCount'),
  assertTotalClients: require('./assertTotalClients'),
};
