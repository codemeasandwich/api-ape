/**
 * @fileoverview Connection Actions - Atomic operations for client connections
 *
 * These actions handle client connection operations through api-ape's public interface.
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/connection
 *
 * @example
 * const connection = require('../actions/connection')
 *
 * // Connect a client
 * const client = await connection.connect({ harness, server })
 *
 * // Verify connected
 * connection.assertConnected({ client })
 *
 * // Disconnect
 * await connection.disconnect({ client })
 */

module.exports = {
  // Connect/disconnect
  connect: require('./connect'),
  connectMany: require('./connectMany'),
  disconnect: require('./disconnect'),
  disconnectMany: require('./disconnectMany'),
  reconnect: require('./reconnect'),

  // State queries
  isConnected: require('./isConnected'),
  getState: require('./getState'),
  getClientCount: require('./getClientCount'),

  // Waiting
  waitForDisconnect: require('./waitForDisconnect'),

  // Assertions
  assertConnected: require('./assertConnected'),
  assertDisconnected: require('./assertDisconnected'),
  assertAllConnected: require('./assertAllConnected'),
  assertAllDisconnected: require('./assertAllDisconnected'),
};
