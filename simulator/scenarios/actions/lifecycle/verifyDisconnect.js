/**
 * Verify onDisconnect fires when client disconnects
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to disconnect
 * @param {Object} options.events - Events object to check
 * @param {number} [options.timeout=200] - Timeout for disconnect event (ms)
 * @returns {Promise<void>}
 *
 * @example
 * await verifyDisconnect({ client, events })
 */
async function verifyDisconnect({ client, events, timeout = 200 }) {
  const countBefore = events.disconnections.length;

  await client.disconnect();

  // Wait for onDisconnect to fire
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (events.disconnections.length > countBefore) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  throw new Error(
    `verifyDisconnect: onDisconnect not fired within ${timeout}ms`
  );
}

module.exports = verifyDisconnect;
