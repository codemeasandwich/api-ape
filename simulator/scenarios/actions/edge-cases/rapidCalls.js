/**
 * Make many rapid calls to stress test
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint to call
 * @param {number} options.count - Number of calls
 * @param {boolean} [options.concurrent=true] - Run concurrently or sequentially
 * @param {number} [options.timeout=5000] - Timeout per call (ms)
 * @returns {Promise<{success: number, failed: number, results: Array}>}
 *
 * @example
 * const { success, failed } = await rapidCalls({
 *   client,
 *   endpoint: 'echo',
 *   count: 100,
 *   concurrent: true
 * })
 */
async function rapidCalls({ client, endpoint, count, concurrent = true, timeout = 5000 }) {
  if (!client) {
    throw new Error('rapidCalls: client required');
  }
  if (!count) {
    throw new Error('rapidCalls: count required');
  }

  const results = [];
  let success = 0;
  let failed = 0;

  if (concurrent) {
    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(
        client.call(endpoint, { index: i }, timeout)
          .then((r) => ({ success: true, result: r, index: i }))
          .catch((e) => ({ success: false, error: e, index: i }))
      );
    }
    const outcomes = await Promise.all(promises);
    for (const o of outcomes) {
      results.push(o);
      if (o.success) success++;
      else failed++;
    }
  } else {
    for (let i = 0; i < count; i++) {
      try {
        const result = await client.call(endpoint, { index: i }, timeout);
        results.push({ success: true, result, index: i });
        success++;
      } catch (e) {
        results.push({ success: false, error: e, index: i });
        failed++;
      }
    }
  }

  return { success, failed, results };
}

module.exports = rapidCalls;
