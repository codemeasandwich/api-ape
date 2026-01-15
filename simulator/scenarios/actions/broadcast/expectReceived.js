/**
 * Expect a client to receive a broadcast of a specific type
 *
 * Waits for the client to receive a message of the given type.
 * Returns the received message data.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client expected to receive broadcast
 * @param {string} options.type - Expected message type
 * @param {number} [options.timeout=200] - Time to wait for message (ms)
 * @returns {Promise<Object>} The received message { type, data, err }
 *
 * @example
 * const msg = await expectReceived({
 *   client: bob,
 *   type: 'chat',
 *   timeout: 100
 * })
 * expect(msg.data.text).toBe('Hello!')
 */
async function expectReceived({ client, type, timeout = 200 }) {
  if (!client) {
    throw new Error('expectReceived: client required');
  }
  if (!type) {
    throw new Error('expectReceived: type required');
  }

  try {
    const msg = await client.waitFor(type, timeout);
    return msg;
  } catch (err) {
    throw new Error(
      `expectReceived: client did not receive '${type}' within ${timeout}ms`
    );
  }
}

module.exports = expectReceived;
