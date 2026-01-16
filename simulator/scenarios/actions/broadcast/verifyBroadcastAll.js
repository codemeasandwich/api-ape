const expectAllReceived = require('./expectAllReceived');

/**
 * Test broadcast all: verify all clients received including sender
 *
 * @param {Object} options - Options
 * @param {Object[]} options.clients - All clients that should receive
 * @param {string} options.type - Broadcast type
 * @param {number} [options.timeout=200] - Timeout (ms)
 * @returns {Promise<Array<Object>>} All received messages
 *
 * @example
 * await broadcast.toAll({ server, type: 'system', data: { msg: 'hi' } })
 * const msgs = await verifyBroadcastAll({
 *   clients: [alice, bob, charlie],
 *   type: 'system'
 * })
 */
async function verifyBroadcastAll({ clients, type, timeout = 200 }) {
  return expectAllReceived({ clients, type, timeout });
}

module.exports = verifyBroadcastAll;
