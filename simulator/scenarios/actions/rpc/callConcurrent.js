const call = require('./call');

/**
 * Make multiple concurrent RPC calls
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {Array<{endpoint: string, data?: any}>} options.calls - Calls to make
 * @param {number} [options.timeout=1000] - Timeout per call (ms)
 * @returns {Promise<Array<any>>} Array of results
 *
 * @example
 * const results = await callConcurrent({
 *   client,
 *   calls: [
 *     { endpoint: 'users', data: {} },
 *     { endpoint: 'echo', data: { msg: 'hi' } }
 *   ]
 * })
 */
async function callConcurrent({ client, calls, timeout = 1000 }) {
  if (!Array.isArray(calls)) {
    throw new Error('callConcurrent: calls array required');
  }

  const promises = calls.map(({ endpoint, data }) =>
    call({ client, endpoint, data, timeout })
  );

  return Promise.all(promises);
}

module.exports = callConcurrent;
