/**
 * Test calling after disconnect (should fail)
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint to call
 * @returns {Promise<Error>} The error from the failed call
 */
async function callAfterDisconnect({ client, endpoint }) {
  if (!client) {
    throw new Error('callAfterDisconnect: client required');
  }

  // Disconnect first
  await client.disconnect();

  // Try to call (should fail)
  try {
    await client.call(endpoint, {}, { timeout: 1000 });
    throw new Error('callAfterDisconnect: expected error but call succeeded');
  } catch (err) {
    if (err.message === 'callAfterDisconnect: expected error but call succeeded') {
      throw err;
    }
    return err;
  }
}

module.exports = callAfterDisconnect;
