/**
 * Wait for a specific number of disconnections
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object
 * @param {number} options.count - Expected disconnection count
 * @param {number} [options.timeout=500] - Timeout (ms)
 * @returns {Promise<void>}
 */
async function waitForDisconnections({ events, count, timeout = 500 }) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (events.disconnections.length >= count) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(
    `waitForDisconnections: timed out waiting for ${count} disconnections (got ${events.disconnections.length})`
  );
}

module.exports = waitForDisconnections;
