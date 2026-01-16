const call = require('./call');

/**
 * Make an RPC call and verify the response contains expected values
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint path
 * @param {any} [options.data={}] - Data to send
 * @param {Object} options.expect - Expected values (partial match)
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<any>} Response from the endpoint
 *
 * @example
 * const result = await callAndExpect({
 *   client,
 *   endpoint: 'users',
 *   data: {},
 *   expect: { total: 5 }
 * })
 */
async function callAndExpect({ client, endpoint, data = {}, expect, timeout = 1000 }) {
  const result = await call({ client, endpoint, data, timeout });

  for (const [key, value] of Object.entries(expect || {})) {
    const actualStr = JSON.stringify(result[key]);
    const expectedStr = JSON.stringify(value);
    if (actualStr !== expectedStr) {
      throw new Error(
        `callAndExpect: expected ${key}=${expectedStr} but got ${key}=${actualStr}`
      );
    }
  }

  return result;
}

module.exports = callAndExpect;
