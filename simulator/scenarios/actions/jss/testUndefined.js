const roundTrip = require('./roundTrip');

/**
 * Test undefined round-trip
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint
 * @returns {Promise<{matches: boolean}>}
 *
 * @example
 * await testUndefined({ client, endpoint: 'echo' })
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

module.exports = testUndefined;
