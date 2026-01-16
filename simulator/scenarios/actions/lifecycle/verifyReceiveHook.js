/**
 * Verify onReceive fires when client sends a message
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to send from
 * @param {string} options.endpoint - Endpoint to call
 * @param {any} options.data - Data to send
 * @param {Object} options.events - Events object
 * @param {number} [options.timeout=200] - Timeout (ms)
 * @returns {Promise<Object>} The receive event
 */
async function verifyReceiveHook({ client, endpoint, data, events, timeout = 200 }) {
  const countBefore = events.receives.length;

  await client.call(endpoint, data);

  // Check if receive was logged
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (events.receives.length > countBefore) {
      return events.receives[events.receives.length - 1];
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  throw new Error(
    `verifyReceiveHook: onReceive not fired within ${timeout}ms`
  );
}

module.exports = verifyReceiveHook;
