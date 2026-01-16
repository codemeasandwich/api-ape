const deepEqual = require('./deepEqual');

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
 * const result = await roundTrip({
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

  const received = await client.call(endpoint, data, timeout);

  const matches = deepEqual(data, received);

  return { sent: data, received, matches };
}

module.exports = roundTrip;
