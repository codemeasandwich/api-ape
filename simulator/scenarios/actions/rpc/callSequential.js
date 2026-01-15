const call = require('./call');

/**
 * Make multiple sequential RPC calls
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {Array<{endpoint: string, data?: any}>} options.calls - Calls to make
 * @param {number} [options.timeout=1000] - Timeout per call (ms)
 * @returns {Promise<Array<any>>} Array of results
 *
 * @example
 * const results = await callSequential({
 *   client,
 *   calls: [
 *     { endpoint: 'users', data: {} },
 *     { endpoint: 'users/profile', data: { id: 1 } }
 *   ]
 * })
 */
async function callSequential({ client, calls, timeout = 1000 }) {
  if (!Array.isArray(calls)) {
    throw new Error('callSequential: calls array required');
  }

  const results = [];
  for (const { endpoint, data } of calls) {
    const result = await call({ client, endpoint, data, timeout });
    results.push(result);
  }
  return results;
}

module.exports = callSequential;
