/**
 * Test a call that times out
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint that will exceed timeout
 * @param {any} [options.data={}] - Data to send
 * @param {number} [options.timeout=50] - Timeout to set (ms)
 * @returns {Promise<Error>} Timeout error
 *
 * @example
 * const err = await callWithTimeout({
 *   client,
 *   endpoint: 'delay',
 *   data: { ms: 1000 },
 *   timeout: 50
 * })
 */
async function callWithTimeout({ client, endpoint, data = {}, timeout = 50 }) {
  if (!client) {
    throw new Error('callWithTimeout: client required');
  }

  try {
    await client.call(endpoint, data, timeout);
    throw new Error('callWithTimeout: expected timeout but call succeeded');
  } catch (err) {
    if (err.message === 'callWithTimeout: expected timeout but call succeeded') {
      throw err;
    }
    if (!err.message.toLowerCase().includes('timeout')) {
      throw new Error(`callWithTimeout: expected timeout error but got: ${err.message}`);
    }
    return err;
  }
}

module.exports = callWithTimeout;
