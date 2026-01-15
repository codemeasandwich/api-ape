const roundTrip = require('./roundTrip');

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
 * await testError({ client, endpoint: 'echo', error: new Error('test error') })
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

module.exports = testError;
