/**
 * Set up a broadcast listener on a client
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to listen on
 * @param {string} options.type - Message type to listen for
 * @param {Function} [options.handler] - Optional handler function
 * @returns {Array<Object>} Array that will be populated with received messages
 *
 * @example
 * const messages = listen({ client, type: 'chat' })
 * // ... do stuff that triggers broadcasts ...
 * expect(messages.length).toBe(2)
 */
function listen({ client, type, handler }) {
  if (!client) {
    throw new Error('listen: client required');
  }
  if (!type) {
    throw new Error('listen: type required');
  }

  const received = [];

  client.on(type, (msg) => {
    received.push(msg);
    if (handler) {
      handler(msg);
    }
  });

  return received;
}

module.exports = listen;
