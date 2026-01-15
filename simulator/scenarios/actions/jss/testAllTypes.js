const roundTrip = require('./roundTrip');

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
 * const { results, allPassed } = await testAllTypes({ client, endpoint: 'echo' })
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

module.exports = testAllTypes;
