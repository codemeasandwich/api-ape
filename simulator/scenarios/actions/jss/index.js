/**
 * @fileoverview JSS Actions - Atomic operations for JSS type round-trip testing
 *
 * These actions test api-ape's JSS (JSON Super Set) serialization through the public interface.
 * JSS extends JSON to support additional JavaScript types:
 * - Date
 * - RegExp
 * - Error
 * - Set
 * - Map
 * - undefined
 * - Circular references
 *
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/jss
 *
 * @example
 * const jss = require('../actions/jss')
 *
 * // Test round-trip of complex types
 * await jss.roundTrip({
 *   client,
 *   endpoint: 'echo',
 *   data: {
 *     date: new Date('2024-01-01'),
 *     regex: /test/gi,
 *     set: new Set([1, 2, 3])
 *   }
 * })
 */

module.exports = {
  // Core round-trip testing
  roundTrip: require('./roundTrip'),

  // Individual type tests
  testDate: require('./testDate'),
  testRegExp: require('./testRegExp'),
  testError: require('./testError'),
  testSet: require('./testSet'),
  testMap: require('./testMap'),
  testUndefined: require('./testUndefined'),

  // Comprehensive tests
  testAllTypes: require('./testAllTypes'),
  testNestedComplex: require('./testNestedComplex'),

  // Utilities
  deepEqual: require('./deepEqual'),
  assertType: require('./assertType'),
  createTestData: require('./createTestData'),
};
