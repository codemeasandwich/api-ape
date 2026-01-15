const call = require('./call');

/**
 * Make an RPC call with retry on failure
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint path
 * @param {any} [options.data={}] - Data to send
 * @param {number} [options.retries=3] - Max retry attempts
 * @param {number} [options.retryDelay=100] - Delay between retries (ms)
 * @param {number} [options.timeout=1000] - Timeout per attempt (ms)
 * @returns {Promise<any>} Response
 *
 * @example
 * const result = await callWithRetry({
 *   client,
 *   endpoint: 'flaky-endpoint',
 *   retries: 5
 * })
 */
async function callWithRetry({ client, endpoint, data = {}, retries = 3, retryDelay = 100, timeout = 1000 }) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await call({ client, endpoint, data, timeout });
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }
  }

  throw lastError;
}

module.exports = callWithRetry;
