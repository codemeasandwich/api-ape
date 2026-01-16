/**
 * Test a call with null values in payload
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint to call
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<any>} Response
 */
async function callWithNullValues({ client, endpoint, timeout = 1000 }) {
  if (!client) {
    throw new Error('callWithNullValues: client required');
  }

  const data = {
    nullValue: null,
    nullArray: [null, null],
    nested: { inner: null },
  };

  const result = await client.call(endpoint, data, timeout);

  // Verify nulls preserved
  if (result.nullValue !== null) {
    throw new Error(`callWithNullValues: expected null but got ${result.nullValue}`);
  }

  return result;
}

module.exports = callWithNullValues;
