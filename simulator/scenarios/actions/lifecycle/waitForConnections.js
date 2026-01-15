/**
 * Wait for a specific number of connections
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object
 * @param {number} options.count - Expected connection count
 * @param {number} [options.timeout=500] - Timeout (ms)
 * @returns {Promise<void>}
 */
async function waitForConnections({ events, count, timeout = 500 }) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (events.connections.length >= count) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(
    `waitForConnections: timed out waiting for ${count} connections (got ${events.connections.length})`
  );
}

module.exports = waitForConnections;
