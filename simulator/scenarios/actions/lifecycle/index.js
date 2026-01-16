/**
 * @fileoverview Lifecycle Actions - Atomic operations for connection lifecycle hooks
 *
 * These actions test api-ape's connection lifecycle through the public interface:
 * - onConnect: Called when client connects, can return embed values and hooks
 * - embed: Custom values available as `this.*` in controllers
 * - onReceive/onSend/onError: Message lifecycle hooks
 * - onDisconnect: Called when client disconnects
 *
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/lifecycle
 *
 * @example
 * const lifecycle = require('../actions/lifecycle')
 *
 * const { server, events } = await lifecycle.createServerWithEmbed({
 *   harness,
 *   embed: { userId: '123', role: 'admin' }
 * })
 *
 * const client = await lifecycle.connectAndExpectWelcome({
 *   server,
 *   welcomeType: 'welcome'
 * })
 */

module.exports = {
  // Server creation with lifecycle hooks
  createServerWithEmbed: require('./createServerWithEmbed'),
  createServerWithDynamicEmbed: require('./createServerWithDynamicEmbed'),
  createServerWithWelcome: require('./createServerWithWelcome'),

  // Connection with verification
  connectAndExpectWelcome: require('./connectAndExpectWelcome'),

  // Embed verification
  verifyEmbed: require('./verifyEmbed'),

  // Event tracking
  getEventSnapshot: require('./getEventSnapshot'),
  clearEvents: require('./clearEvents'),

  // Assertions
  assertConnectionCount: require('./assertConnectionCount'),
  assertDisconnectionCount: require('./assertDisconnectionCount'),

  // Waiting utilities
  waitForConnections: require('./waitForConnections'),
  waitForDisconnections: require('./waitForDisconnections'),

  // Hook verification
  verifyDisconnect: require('./verifyDisconnect'),
  verifyReceiveHook: require('./verifyReceiveHook'),

  // Test context helper
  createTestContext: require('./createTestContext'),
};
