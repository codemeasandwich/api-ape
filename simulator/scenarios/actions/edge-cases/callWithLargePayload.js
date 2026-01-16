/**
 * Test a call with a large payload
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Echo endpoint to return data
 * @param {number} options.sizeBytes - Size of payload to generate
 * @param {number} [options.timeout=5000] - Timeout (ms)
 * @returns {Promise<{sent: number, received: number, matches: boolean}>}
 *
 * @example
 * const result = await callWithLargePayload({
 *   client,
 *   endpoint: 'echo',
 *   sizeBytes: 1024 * 100 // 100KB
 * })
 */
async function callWithLargePayload({ client, endpoint, sizeBytes, timeout = 5000 }) {
  if (!client) {
    throw new Error('callWithLargePayload: client required');
  }
  if (!sizeBytes) {
    throw new Error('callWithLargePayload: sizeBytes required');
  }

  // Create large string payload
  const largeData = 'x'.repeat(sizeBytes);

  const result = await client.call(endpoint, { largeData }, timeout);

  const matches = result.largeData === largeData;

  return {
    sent: largeData.length,
    received: result.largeData?.length || 0,
    matches,
  };
}

module.exports = callWithLargePayload;
