/**
 * Disconnect a client from the server
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to disconnect
 * @returns {Promise<void>}
 *
 * @example
 * await disconnect({ client })
 */
async function disconnect({ client }) {
  if (!client) {
    throw new Error('disconnect: client required');
  }

  await client.disconnect();
}

module.exports = disconnect;
