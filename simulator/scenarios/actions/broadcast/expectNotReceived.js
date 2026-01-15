/**
 * Expect a client NOT to receive a broadcast of a specific type
 *
 * Waits for the timeout period and verifies no message was received.
 * Useful for testing broadcastOthers() excludes the sender.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client that should NOT receive broadcast
 * @param {string} options.type - Message type that should not be received
 * @param {number} [options.timeout=50] - Time to wait before confirming (ms)
 * @returns {Promise<void>}
 *
 * @example
 * // Alice sent the message, so she shouldn't receive it back
 * await expectNotReceived({
 *   client: alice,
 *   type: 'message',
 *   timeout: 50
 * })
 */
async function expectNotReceived({ client, type, timeout = 50 }) {
  if (!client) {
    throw new Error('expectNotReceived: client required');
  }
  if (!type) {
    throw new Error('expectNotReceived: type required');
  }

  // Check if message already in buffer
  const existing = client.getMessages(type);
  if (existing && existing.length > 0) {
    throw new Error(
      `expectNotReceived: client already has ${existing.length} '${type}' message(s)`
    );
  }

  // Wait briefly and check again
  await new Promise((r) => setTimeout(r, timeout));

  const messages = client.getMessages(type);
  if (messages && messages.length > 0) {
    throw new Error(
      `expectNotReceived: client received '${type}' message (should not have)`
    );
  }
}

module.exports = expectNotReceived;
