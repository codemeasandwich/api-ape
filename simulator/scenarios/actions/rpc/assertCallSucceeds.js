const call = require('./call');

/**
 * Assert that an RPC call succeeds (does not throw)
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint path
 * @param {any} [options.data={}] - Data to send
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<any>} Response
 */
async function assertCallSucceeds({ client, endpoint, data = {}, timeout = 1000 }) {
  try {
    return await call({ client, endpoint, data, timeout });
  } catch (err) {
    throw new Error(
      `assertCallSucceeds: call to '${endpoint}' failed with: ${err.message}`
    );
  }
}

module.exports = assertCallSucceeds;
