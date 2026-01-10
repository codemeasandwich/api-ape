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
 * const { jss } = require('../actions')
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

/**
 * Test round-trip of data through api-ape, verifying JSS preserves types
 *
 * Sends data to an endpoint that echoes it back, then verifies the
 * returned data matches the original (including type preservation).
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint that returns the data (e.g., 'echo')
 * @param {any} options.data - Data to round-trip
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<{sent: any, received: any, matches: boolean}>}
 *
 * @example
 * const result = await jss.roundTrip({
 *   client,
 *   endpoint: 'echo',
 *   data: { date: new Date(), regex: /test/i }
 * })
 * expect(result.matches).toBe(true)
 */
async function roundTrip({ client, endpoint, data, timeout = 1000 }) {
  if (!client) {
    throw new Error('roundTrip: client required');
  }
  if (!endpoint) {
    throw new Error('roundTrip: endpoint required');
  }

  const received = await client.call(endpoint, data, { timeout });

  const matches = deepEqual(data, received);

  return { sent: data, received, matches };
}

/**
 * Test Date round-trip
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @param {Date} [options.date] - Date to test (default: now)
 * @returns {Promise<{sent: Date, received: Date, matches: boolean}>}
 *
 * @example
 * await jss.testDate({ client, endpoint: 'echo', date: new Date('2024-01-01') })
 */
async function testDate({ client, endpoint, date }) {
  const testDate = date || new Date();
  const { received, matches } = await roundTrip({
    client,
    endpoint,
    data: { date: testDate },
  });

  // Verify it's actually a Date object
  if (!(received.date instanceof Date)) {
    throw new Error(
      `testDate: expected Date instance but got ${typeof received.date}`
    );
  }

  // Verify timestamp matches
  if (received.date.getTime() !== testDate.getTime()) {
    throw new Error(
      `testDate: timestamp mismatch (sent: ${testDate.getTime()}, received: ${received.date.getTime()})`
    );
  }

  return { sent: testDate, received: received.date, matches: true };
}

/**
 * Test RegExp round-trip
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @param {RegExp} [options.regex] - RegExp to test (default: /test/gi)
 * @returns {Promise<{sent: RegExp, received: RegExp, matches: boolean}>}
 *
 * @example
 * await jss.testRegExp({ client, endpoint: 'echo', regex: /hello\s+world/i })
 */
async function testRegExp({ client, endpoint, regex }) {
  const testRegex = regex || /test/gi;
  const { received } = await roundTrip({
    client,
    endpoint,
    data: { regex: testRegex },
  });

  // Verify it's actually a RegExp object
  if (!(received.regex instanceof RegExp)) {
    throw new Error(
      `testRegExp: expected RegExp instance but got ${typeof received.regex}`
    );
  }

  // Verify pattern and flags match
  if (received.regex.source !== testRegex.source) {
    throw new Error(
      `testRegExp: pattern mismatch (sent: ${testRegex.source}, received: ${received.regex.source})`
    );
  }

  if (received.regex.flags !== testRegex.flags) {
    throw new Error(
      `testRegExp: flags mismatch (sent: ${testRegex.flags}, received: ${received.regex.flags})`
    );
  }

  return { sent: testRegex, received: received.regex, matches: true };
}

/**
 * Test Error round-trip
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @param {Error} [options.error] - Error to test
 * @returns {Promise<{sent: Error, received: Error, matches: boolean}>}
 *
 * @example
 * await jss.testError({ client, endpoint: 'echo', error: new Error('test error') })
 */
async function testError({ client, endpoint, error }) {
  const testError = error || new Error('test error message');
  const { received } = await roundTrip({
    client,
    endpoint,
    data: { error: testError },
  });

  // Verify it's actually an Error object
  if (!(received.error instanceof Error)) {
    throw new Error(
      `testError: expected Error instance but got ${typeof received.error}`
    );
  }

  // Verify message matches
  if (received.error.message !== testError.message) {
    throw new Error(
      `testError: message mismatch (sent: ${testError.message}, received: ${received.error.message})`
    );
  }

  return { sent: testError, received: received.error, matches: true };
}

/**
 * Test Set round-trip
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @param {Set} [options.set] - Set to test
 * @returns {Promise<{sent: Set, received: Set, matches: boolean}>}
 *
 * @example
 * await jss.testSet({ client, endpoint: 'echo', set: new Set([1, 2, 3]) })
 */
async function testSet({ client, endpoint, set }) {
  const testSet = set || new Set([1, 2, 3, 'a', 'b']);
  const { received } = await roundTrip({
    client,
    endpoint,
    data: { set: testSet },
  });

  // Verify it's actually a Set object
  if (!(received.set instanceof Set)) {
    throw new Error(
      `testSet: expected Set instance but got ${typeof received.set}`
    );
  }

  // Verify size matches
  if (received.set.size !== testSet.size) {
    throw new Error(
      `testSet: size mismatch (sent: ${testSet.size}, received: ${received.set.size})`
    );
  }

  // Verify all values present
  for (const value of testSet) {
    if (!received.set.has(value)) {
      throw new Error(`testSet: missing value ${JSON.stringify(value)}`);
    }
  }

  return { sent: testSet, received: received.set, matches: true };
}

/**
 * Test Map round-trip
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @param {Map} [options.map] - Map to test
 * @returns {Promise<{sent: Map, received: Map, matches: boolean}>}
 *
 * @example
 * await jss.testMap({ client, endpoint: 'echo', map: new Map([['a', 1], ['b', 2]]) })
 */
async function testMap({ client, endpoint, map }) {
  const testMap = map || new Map([['a', 1], ['b', 2], ['c', 3]]);
  const { received } = await roundTrip({
    client,
    endpoint,
    data: { map: testMap },
  });

  // Verify it's actually a Map object
  if (!(received.map instanceof Map)) {
    throw new Error(
      `testMap: expected Map instance but got ${typeof received.map}`
    );
  }

  // Verify size matches
  if (received.map.size !== testMap.size) {
    throw new Error(
      `testMap: size mismatch (sent: ${testMap.size}, received: ${received.map.size})`
    );
  }

  // Verify all entries present
  for (const [key, value] of testMap) {
    if (!received.map.has(key)) {
      throw new Error(`testMap: missing key ${JSON.stringify(key)}`);
    }
    const receivedValue = received.map.get(key);
    if (receivedValue !== value) {
      throw new Error(
        `testMap: value mismatch for key ${JSON.stringify(key)} (sent: ${value}, received: ${receivedValue})`
      );
    }
  }

  return { sent: testMap, received: received.map, matches: true };
}

/**
 * Test undefined round-trip
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @returns {Promise<{matches: boolean}>}
 *
 * @example
 * await jss.testUndefined({ client, endpoint: 'echo' })
 */
async function testUndefined({ client, endpoint }) {
  const { received } = await roundTrip({
    client,
    endpoint,
    data: { value: undefined, explicit: undefined },
  });

  // Verify undefined is preserved (not converted to null or omitted)
  if (received.value !== undefined) {
    throw new Error(
      `testUndefined: expected undefined but got ${JSON.stringify(received.value)}`
    );
  }

  return { matches: true };
}

/**
 * Test all JSS types in a single round-trip
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<{results: Object, allPassed: boolean}>}
 *
 * @example
 * const { results, allPassed } = await jss.testAllTypes({ client, endpoint: 'echo' })
 * expect(allPassed).toBe(true)
 */
async function testAllTypes({ client, endpoint, timeout = 1000 }) {
  const testData = {
    date: new Date('2024-06-15T12:30:45.123Z'),
    regex: /pattern[a-z]+/gi,
    error: new Error('test error'),
    set: new Set([1, 2, 3, 'x', 'y']),
    map: new Map([['key1', 'value1'], ['key2', 42]]),
    undef: undefined,
    // Also test nested structures
    nested: {
      innerDate: new Date('2020-01-01'),
      innerSet: new Set(['nested']),
    },
    array: [
      new Date(),
      /array-regex/,
      new Set([100]),
    ],
  };

  const { received } = await roundTrip({ client, endpoint, data: testData, timeout });

  const results = {
    date: false,
    regex: false,
    error: false,
    set: false,
    map: false,
    undefined: false,
    nestedDate: false,
    nestedSet: false,
    arrayTypes: false,
  };

  // Check each type
  try {
    if (received.date instanceof Date && received.date.getTime() === testData.date.getTime()) {
      results.date = true;
    }
  } catch (e) { /* failed */ }

  try {
    if (received.regex instanceof RegExp &&
        received.regex.source === testData.regex.source &&
        received.regex.flags === testData.regex.flags) {
      results.regex = true;
    }
  } catch (e) { /* failed */ }

  try {
    if (received.error instanceof Error && received.error.message === testData.error.message) {
      results.error = true;
    }
  } catch (e) { /* failed */ }

  try {
    if (received.set instanceof Set && received.set.size === testData.set.size) {
      results.set = true;
    }
  } catch (e) { /* failed */ }

  try {
    if (received.map instanceof Map && received.map.size === testData.map.size) {
      results.map = true;
    }
  } catch (e) { /* failed */ }

  try {
    if (received.undef === undefined) {
      results.undefined = true;
    }
  } catch (e) { /* failed */ }

  try {
    if (received.nested?.innerDate instanceof Date) {
      results.nestedDate = true;
    }
  } catch (e) { /* failed */ }

  try {
    if (received.nested?.innerSet instanceof Set) {
      results.nestedSet = true;
    }
  } catch (e) { /* failed */ }

  try {
    if (Array.isArray(received.array) &&
        received.array[0] instanceof Date &&
        received.array[1] instanceof RegExp &&
        received.array[2] instanceof Set) {
      results.arrayTypes = true;
    }
  } catch (e) { /* failed */ }

  const allPassed = Object.values(results).every(Boolean);

  return { results, allPassed, sent: testData, received };
}

/**
 * Test complex nested structure with mixed types
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @returns {Promise<{matches: boolean, sent: any, received: any}>}
 */
async function testNestedComplex({ client, endpoint }) {
  const testData = {
    users: [
      {
        id: 1,
        createdAt: new Date('2024-01-01'),
        tags: new Set(['admin', 'active']),
        metadata: new Map([['lastLogin', new Date()], ['loginCount', 42]]),
      },
      {
        id: 2,
        createdAt: new Date('2024-02-15'),
        tags: new Set(['user']),
        metadata: new Map([['preferences', { theme: 'dark' }]]),
      },
    ],
    config: {
      patterns: [/include-.*/, /exclude-.*/i],
      lastUpdated: new Date(),
    },
  };

  const { received, matches } = await roundTrip({ client, endpoint, data: testData });

  // Additional verification
  if (!Array.isArray(received.users) || received.users.length !== 2) {
    throw new Error('testNestedComplex: users array structure invalid');
  }

  if (!(received.users[0].createdAt instanceof Date)) {
    throw new Error('testNestedComplex: nested Date not preserved');
  }

  if (!(received.users[0].tags instanceof Set)) {
    throw new Error('testNestedComplex: nested Set not preserved');
  }

  if (!(received.users[0].metadata instanceof Map)) {
    throw new Error('testNestedComplex: nested Map not preserved');
  }

  return { matches: true, sent: testData, received };
}

/**
 * Deep equality check that handles JSS types
 *
 * @param {any} a - First value
 * @param {any} b - Second value
 * @returns {boolean} True if deeply equal
 * @private
 */
function deepEqual(a, b) {
  // Same reference or primitives
  if (a === b) return true;

  // Null/undefined check
  if (a == null || b == null) return a === b;

  // Type check
  if (typeof a !== typeof b) return false;

  // Date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // RegExp comparison
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  // Error comparison
  if (a instanceof Error && b instanceof Error) {
    return a.message === b.message;
  }

  // Set comparison
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  // Map comparison
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(b.get(key), value)) return false;
    }
    return true;
  }

  // Array comparison
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Object comparison
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Assert that a value is of a specific JSS type
 *
 * @param {Object} options - Options
 * @param {any} options.value - Value to check
 * @param {string} options.type - Expected type: 'date', 'regexp', 'error', 'set', 'map'
 * @returns {void}
 */
function assertType({ value, type }) {
  const typeChecks = {
    date: (v) => v instanceof Date,
    regexp: (v) => v instanceof RegExp,
    error: (v) => v instanceof Error,
    set: (v) => v instanceof Set,
    map: (v) => v instanceof Map,
  };

  const check = typeChecks[type.toLowerCase()];
  if (!check) {
    throw new Error(`assertType: unknown type '${type}'`);
  }

  if (!check(value)) {
    throw new Error(`assertType: expected ${type} but got ${typeof value}`);
  }
}

/**
 * Create test data with all JSS types
 *
 * @returns {Object} Test data object
 */
function createTestData() {
  return {
    date: new Date(),
    dateSpecific: new Date('2024-06-15T10:30:00Z'),
    regex: /test-pattern/gi,
    regexComplex: /^[a-z]+\d{2,4}$/im,
    error: new Error('test error'),
    set: new Set([1, 2, 3, 'a', 'b', 'c']),
    setMixed: new Set([1, 'two', true, null]),
    map: new Map([['key1', 'value1'], ['key2', 2]]),
    mapComplex: new Map([[1, 'one'], ['two', 2], [true, 'yes']]),
    undef: undefined,
  };
}

module.exports = {
  // Core round-trip testing
  roundTrip,

  // Individual type tests
  testDate,
  testRegExp,
  testError,
  testSet,
  testMap,
  testUndefined,

  // Comprehensive tests
  testAllTypes,
  testNestedComplex,

  // Utilities
  deepEqual,
  assertType,
  createTestData,
};
