const roundTrip = require('./roundTrip');

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
 * await testMap({ client, endpoint: 'echo', map: new Map([['a', 1], ['b', 2]]) })
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

module.exports = testMap;
