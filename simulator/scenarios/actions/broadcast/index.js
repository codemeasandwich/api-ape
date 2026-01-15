/**
 * @fileoverview Broadcast Actions - Atomic operations for broadcast messaging
 *
 * These actions handle broadcast operations through api-ape's public interface.
 * Broadcasts are messages pushed from the server to connected clients.
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/broadcast
 *
 * @example
 * const broadcast = require('../actions/broadcast')
 *
 * // From server: broadcast to all
 * await broadcast.toAll({ server, type: 'announcement', data: { msg: 'hi' } })
 *
 * // From controller via client call: broadcast to others
 * await broadcast.toOthers({ sender: alice, type: 'chat', data: { text: 'hello' } })
 *
 * // Verify receipt
 * await broadcast.expectReceived({ client: bob, type: 'chat' })
 */

module.exports = {
  // Sending broadcasts
  toAll: require('./toAll'),
  toOthers: require('./toOthers'),

  // Expecting/verifying receipt
  expectReceived: require('./expectReceived'),
  expectReceivedWithData: require('./expectReceivedWithData'),
  expectNotReceived: require('./expectNotReceived'),
  expectAllReceived: require('./expectAllReceived'),
  expectNoneReceived: require('./expectNoneReceived'),

  // Compound verifications
  verifyBroadcastOthers: require('./verifyBroadcastOthers'),
  verifyBroadcastAll: require('./verifyBroadcastAll'),

  // Message management
  getReceived: require('./getReceived'),
  clearReceived: require('./clearReceived'),
  countReceived: require('./countReceived'),

  // Listeners
  listen: require('./listen'),
  listenAll: require('./listenAll'),

  // Assertions
  assertReceivedCount: require('./assertReceivedCount'),
};
