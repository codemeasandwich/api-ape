/**
 * Wait for a client to disconnect
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to wait on
 * @param {number} [options.timeout=500] - Timeout (ms)
 * @returns {Promise<void>}
 *
 * @example
 * await waitForDisconnect({ client })
 */
async function waitForDisconnect({ client, timeout = 500 }) {
  if (!client) {
    throw new Error('waitForDisconnect: client required');
  }

  if (!client.connected) {
    return;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`waitForDisconnect: timed out after ${timeout}ms`));
    }, timeout);

    client.on('disconnected', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

module.exports = waitForDisconnect;
