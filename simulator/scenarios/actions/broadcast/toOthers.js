/**
 * Broadcast to others via a controller that uses this.broadcastOthers()
 *
 * This triggers a broadcast by having a client call an endpoint that
 * internally uses this.broadcastOthers(). The sender will NOT receive
 * the broadcast, but all other clients will.
 *
 * @param {Object} options - Options
 * @param {Object} options.sender - Client making the call that triggers broadcast
 * @param {string} options.endpoint - Endpoint that broadcasts (e.g., 'message')
 * @param {any} options.data - Data to send to the endpoint
 * @param {string} options.broadcastType - Expected broadcast type to be emitted
 * @returns {Promise<any>} Result from the endpoint call
 *
 * @example
 * // Assuming 'message' endpoint calls this.broadcastOthers('message', data)
 * const result = await toOthers({
 *   sender: alice,
 *   endpoint: 'message',
 *   data: { text: 'Hello everyone!' },
 *   broadcastType: 'message'
 * })
 */
async function toOthers({ sender, endpoint, data, broadcastType }) {
  if (!sender) {
    throw new Error('toOthers: sender client required');
  }
  if (!endpoint) {
    throw new Error('toOthers: endpoint required');
  }

  const result = await sender.call(endpoint, data);

  // Give time for broadcast to propagate
  await new Promise((r) => setImmediate(r));

  return result;
}

module.exports = toOthers;
