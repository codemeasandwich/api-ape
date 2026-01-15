/**
 * Test a call with deeply nested payload
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint to call
 * @param {number} [options.depth=10] - Nesting depth
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<{sent: Object, received: Object, matches: boolean}>}
 */
async function callWithDeepNesting({ client, endpoint, depth = 10, timeout = 1000 }) {
  if (!client) {
    throw new Error('callWithDeepNesting: client required');
  }

  // Build nested structure
  let nested = { value: 'deepest' };
  for (let i = 0; i < depth; i++) {
    nested = { level: depth - i, nested };
  }

  const result = await client.call(endpoint, nested, timeout);

  // Verify deepest value
  let current = result;
  for (let i = 0; i < depth; i++) {
    current = current.nested;
  }

  const matches = current?.value === 'deepest';

  return { sent: nested, received: result, matches };
}

module.exports = callWithDeepNesting;
