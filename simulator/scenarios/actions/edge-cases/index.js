/**
 * @fileoverview Edge Case Actions - Testing boundary conditions and stress scenarios
 *
 * These actions test edge cases through api-ape's public interface:
 * - Timeouts
 * - Large payloads
 * - Rapid operations
 * - Special characters
 * - Missing endpoints
 * - Disconnect scenarios
 *
 * @module simulator/scenarios/actions/edge-cases
 *
 * @example
 * const edge = require('../actions/edge-cases')
 *
 * // Test timeout
 * const err = await edge.callWithTimeout({
 *   client,
 *   endpoint: 'delay',
 *   timeout: 50
 * })
 *
 * // Stress test
 * const { success, failed } = await edge.rapidCalls({
 *   client,
 *   endpoint: 'echo',
 *   count: 100
 * })
 */

module.exports = {
  // Timeout testing
  callWithTimeout: require('./callWithTimeout'),

  // Payload testing
  callWithLargePayload: require('./callWithLargePayload'),
  callWithEmptyPayload: require('./callWithEmptyPayload'),
  callWithNullValues: require('./callWithNullValues'),
  callWithDeepNesting: require('./callWithDeepNesting'),
  callWithSpecialChars: require('./callWithSpecialChars'),

  // Error scenarios
  callMissingEndpoint: require('./callMissingEndpoint'),
  callAfterDisconnect: require('./callAfterDisconnect'),

  // Stress testing
  rapidCalls: require('./rapidCalls'),
  rapidConnectDisconnect: require('./rapidConnectDisconnect'),
  manyClientsStress: require('./manyClientsStress'),

  // Disconnect scenarios
  disconnectDuringCall: require('./disconnectDuringCall'),

  // Broadcast edge cases
  broadcastToEmpty: require('./broadcastToEmpty'),
};
