/**
 * @fileoverview RPC Actions - Atomic operations for RPC (Remote Procedure Call) testing
 *
 * These actions handle RPC operations through api-ape's public interface.
 * RPC calls invoke server-side controller functions and return results.
 *
 * All operations execute instantly in the virtual environment (no network delay),
 * except for controllers that explicitly delay (like the 'delay' endpoint).
 *
 * @module simulator/scenarios/actions/rpc
 *
 * @example
 * const rpc = require('../actions/rpc')
 *
 * // Simple call
 * const result = await rpc.call({
 *   client,
 *   endpoint: 'users',
 *   data: { role: 'admin' }
 * })
 *
 * // Call and verify response
 * await rpc.callAndExpect({
 *   client,
 *   endpoint: 'echo',
 *   data: { msg: 'hi' },
 *   expect: { msg: 'hi' }
 * })
 */

module.exports = {
  // Core operations
  call: require('./call'),
  callAndExpect: require('./callAndExpect'),
  callAndExpectError: require('./callAndExpectError'),

  // Multiple calls
  callSequential: require('./callSequential'),
  callConcurrent: require('./callConcurrent'),

  // Nested routes
  callNested: require('./callNested'),

  // Resilience
  callWithRetry: require('./callWithRetry'),

  // Timing
  measureCallTime: require('./measureCallTime'),

  // Assertions
  assertCallSucceeds: require('./assertCallSucceeds'),
  assertCallFails: require('./assertCallFails'),
  assertCallTime: require('./assertCallTime'),
};
