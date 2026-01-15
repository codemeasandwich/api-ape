const call = require('./call');

/**
 * Make an RPC call and measure how long it takes
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint path
 * @param {any} [options.data={}] - Data to send
 * @param {number} [options.timeout=5000] - Timeout (ms)
 * @returns {Promise<{result: any, elapsed: number}>}
 *
 * @example
 * const { result, elapsed } = await measureCallTime({
 *   client,
 *   endpoint: 'delay',
 *   data: { ms: 100 }
 * })
 * expect(elapsed).toBeGreaterThan(90)
 */
async function measureCallTime({ client, endpoint, data = {}, timeout = 5000 }) {
  const start = Date.now();
  const result = await call({ client, endpoint, data, timeout });
  const elapsed = Date.now() - start;

  return { result, elapsed };
}

module.exports = measureCallTime;
