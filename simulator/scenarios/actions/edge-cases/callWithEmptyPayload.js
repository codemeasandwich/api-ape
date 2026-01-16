/**
 * Test a call with empty payload
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint to call
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<any>} Response
 */
async function callWithEmptyPayload({ client, endpoint, timeout = 1000 }) {
  if (!client) {
    throw new Error('callWithEmptyPayload: client required');
  }

  return client.call(endpoint, {}, timeout);
}

module.exports = callWithEmptyPayload;
