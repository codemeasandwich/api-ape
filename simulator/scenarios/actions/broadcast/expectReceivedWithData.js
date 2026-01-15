const expectReceived = require('./expectReceived');

/**
 * Expect a client to receive a broadcast with specific data
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client expected to receive broadcast
 * @param {string} options.type - Expected message type
 * @param {any} options.data - Expected data (partial match)
 * @param {number} [options.timeout=200] - Time to wait (ms)
 * @returns {Promise<Object>} The received message
 *
 * @example
 * await expectReceivedWithData({
 *   client: bob,
 *   type: 'chat',
 *   data: { text: 'Hello!' }
 * })
 */
async function expectReceivedWithData({ client, type, data: expectedData, timeout = 200 }) {
  const msg = await expectReceived({ client, type, timeout });

  // Check if expected data is contained in received data
  for (const [key, value] of Object.entries(expectedData || {})) {
    const actualStr = JSON.stringify(msg.data?.[key]);
    const expectedStr = JSON.stringify(value);
    if (actualStr !== expectedStr) {
      throw new Error(
        `expectReceivedWithData: expected ${key}=${expectedStr} but got ${key}=${actualStr}`
      );
    }
  }

  return msg;
}

module.exports = expectReceivedWithData;
