const roundTrip = require('./roundTrip');

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
 * await testRegExp({ client, endpoint: 'echo', regex: /hello\s+world/i })
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

module.exports = testRegExp;
