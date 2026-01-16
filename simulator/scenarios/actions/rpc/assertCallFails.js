const callAndExpectError = require('./callAndExpectError');

/**
 * Assert that an RPC call fails (throws an error)
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint path
 * @param {any} [options.data={}] - Data to send
 * @param {string|RegExp} [options.errorMatch] - Expected error pattern
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<Error>} The error that was thrown
 */
async function assertCallFails({ client, endpoint, data = {}, errorMatch, timeout = 1000 }) {
  return callAndExpectError({ client, endpoint, data, errorMatch, timeout });
}

module.exports = assertCallFails;
