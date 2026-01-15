const expectNotReceived = require('./expectNotReceived');
const expectAllReceived = require('./expectAllReceived');

/**
 * Test broadcast exclusion: verify sender excluded, others received
 *
 * @param {Object} options - Options
 * @param {Object} options.sender - Client that triggered the broadcast
 * @param {Object[]} options.receivers - Clients that should receive
 * @param {string} options.type - Broadcast type
 * @param {number} [options.timeout=200] - Timeout (ms)
 * @returns {Promise<Array<Object>>} Messages received by receivers
 *
 * @example
 * const msgs = await verifyBroadcastOthers({
 *   sender: alice,
 *   receivers: [bob, charlie],
 *   type: 'message'
 * })
 */
async function verifyBroadcastOthers({ sender, receivers, type, timeout = 200 }) {
  // Verify sender did NOT receive
  await expectNotReceived({ client: sender, type, timeout: Math.min(50, timeout) });

  // Verify all receivers DID receive
  const messages = await expectAllReceived({ clients: receivers, type, timeout });

  return messages;
}

module.exports = verifyBroadcastOthers;
