/**
 * Test disconnecting during a long-running call
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Slow endpoint (e.g., 'delay')
 * @param {any} [options.data={ ms: 500 }] - Data for slow endpoint
 * @param {number} [options.disconnectAfter=50] - Ms before disconnecting
 * @returns {Promise<{callError: Error|null, disconnected: boolean}>}
 */
async function disconnectDuringCall({ client, endpoint, data = { ms: 500 }, disconnectAfter = 50 }) {
  if (!client) {
    throw new Error('disconnectDuringCall: client required');
  }

  let callError = null;

  // Start the call
  const callPromise = client.call(endpoint, data, { timeout: 5000 })
    .catch((err) => {
      callError = err;
    });

  // Disconnect after delay
  await new Promise((r) => setTimeout(r, disconnectAfter));
  await client.disconnect();

  // Wait for call to complete/fail
  await callPromise;

  return {
    callError,
    disconnected: !client.connected,
  };
}

module.exports = disconnectDuringCall;
