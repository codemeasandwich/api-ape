const createServerWithEmbed = require('./createServerWithEmbed');

/**
 * Create a server with dynamic embed based on request
 *
 * Useful for testing user-specific embed values from cookies, headers, etc.
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Function} options.embedFromRequest - Function (req) => embed
 * @param {string} [options.where='controllers'] - Controller directory
 * @returns {Promise<{server: Object, events: Object}>}
 *
 * @example
 * const { server, events } = await createServerWithDynamicEmbed({
 *   harness,
 *   embedFromRequest: (req) => ({
 *     userId: extractUserIdFromCookie(req.headers.cookie)
 *   })
 * })
 */
async function createServerWithDynamicEmbed({ harness, embedFromRequest, where = 'controllers' }) {
  if (typeof embedFromRequest !== 'function') {
    throw new Error('createServerWithDynamicEmbed: embedFromRequest function required');
  }

  return createServerWithEmbed({
    harness,
    where,
    embed: (socket, req) => embedFromRequest(req),
  });
}

module.exports = createServerWithDynamicEmbed;
