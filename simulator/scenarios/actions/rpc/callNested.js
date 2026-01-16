const call = require('./call');

/**
 * Call a nested endpoint (e.g., 'users/profile' or 'nested/deep/handler')
 *
 * This is a semantic helper for calling nested routes.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {Array<string>} options.path - Path segments (e.g., ['users', 'profile'])
 * @param {any} [options.data={}] - Data to send
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<any>} Response
 *
 * @example
 * const result = await callNested({
 *   client,
 *   path: ['nested', 'deep', 'handler'],
 *   data: { message: 'test' }
 * })
 */
async function callNested({ client, path, data = {}, timeout = 1000 }) {
  if (!Array.isArray(path)) {
    throw new Error('callNested: path array required');
  }

  const endpoint = path.join('/');
  return call({ client, endpoint, data, timeout });
}

module.exports = callNested;
