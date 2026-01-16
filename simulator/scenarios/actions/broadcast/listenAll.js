const listen = require('./listen');

/**
 * Set up listeners on multiple clients and return a map of received messages
 *
 * @param {Object} options - Options
 * @param {Object[]} options.clients - Array of clients
 * @param {string} options.type - Message type to listen for
 * @returns {Map<Object, Array<Object>>} Map of client -> received messages
 *
 * @example
 * const receivedMap = listenAll({ clients: [alice, bob, charlie], type: 'chat' })
 * // ... trigger broadcast ...
 * expect(receivedMap.get(bob).length).toBe(1)
 */
function listenAll({ clients, type }) {
  if (!Array.isArray(clients)) {
    throw new Error('listenAll: clients array required');
  }

  const map = new Map();

  for (const client of clients) {
    const received = listen({ client, type });
    map.set(client, received);
  }

  return map;
}

module.exports = listenAll;
