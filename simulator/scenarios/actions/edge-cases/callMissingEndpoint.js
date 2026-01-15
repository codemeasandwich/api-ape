/**
 * Test calling a non-existent endpoint
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} [options.endpoint='nonexistent-endpoint-xyz'] - Missing endpoint
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<Error>} The error
 */
async function callMissingEndpoint({ client, endpoint = 'nonexistent-endpoint-xyz', timeout = 1000 }) {
  if (!client) {
    throw new Error('callMissingEndpoint: client required');
  }

  try {
    await client.call(endpoint, {}, timeout);
    throw new Error('callMissingEndpoint: expected error but call succeeded');
  } catch (err) {
    if (err.message === 'callMissingEndpoint: expected error but call succeeded') {
      throw err;
    }
    return err;
  }
}

module.exports = callMissingEndpoint;
