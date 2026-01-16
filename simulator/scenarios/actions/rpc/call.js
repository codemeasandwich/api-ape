/**
 * Make an RPC call from client to server
 *
 * This is the core operation for api-ape. Calls an endpoint on the server
 * and returns the result. The endpoint maps to a controller file.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint path (e.g., 'echo', 'users/profile')
 * @param {any} [options.data={}] - Data to send to the endpoint
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<any>} Response from the endpoint
 *
 * @example
 * const result = await call({
 *   client,
 *   endpoint: 'users',
 *   data: { role: 'admin' }
 * })
 */
async function call({ client, endpoint, data = {}, timeout = 1000 }) {
  if (!client) {
    throw new Error('call: client required');
  }
  if (!endpoint) {
    throw new Error('call: endpoint required');
  }

  const result = await client.call(endpoint, data, timeout);
  return result;
}

module.exports = call;
