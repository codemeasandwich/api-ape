/**
 * Test broadcasting when no clients are connected (except sender)
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Lone connected client
 * @param {string} options.endpoint - Broadcast endpoint
 * @param {any} [options.data={}] - Data to broadcast
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<any>} Response
 */
async function broadcastToEmpty({ client, endpoint, data = {}, timeout = 1000 }) {
  if (!client) {
    throw new Error('broadcastToEmpty: client required');
  }

  // This should succeed even with no other clients
  const result = await client.call(endpoint, data, timeout);
  return result;
}

module.exports = broadcastToEmpty;
