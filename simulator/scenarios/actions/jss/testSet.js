const roundTrip = require('./roundTrip');

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
 * await testSet({ client, endpoint: 'echo', set: new Set([1, 2, 3]) })
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

module.exports = testSet;
