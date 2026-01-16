const measureCallTime = require('./measureCallTime');

/**
 * Assert call completes within time bounds
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint path
 * @param {any} [options.data={}] - Data to send
 * @param {number} [options.minMs] - Minimum time (ms)
 * @param {number} [options.maxMs] - Maximum time (ms)
 * @param {number} [options.timeout=5000] - Request timeout (ms)
 * @returns {Promise<{result: any, elapsed: number}>}
 */
async function assertCallTime({ client, endpoint, data = {}, minMs, maxMs, timeout = 5000 }) {
  const { result, elapsed } = await measureCallTime({ client, endpoint, data, timeout });

  if (minMs !== undefined && elapsed < minMs) {
    throw new Error(
      `assertCallTime: call took ${elapsed}ms but expected at least ${minMs}ms`
    );
  }

  if (maxMs !== undefined && elapsed > maxMs) {
    throw new Error(
      `assertCallTime: call took ${elapsed}ms but expected at most ${maxMs}ms`
    );
  }

  return { result, elapsed };
}

module.exports = assertCallTime;
