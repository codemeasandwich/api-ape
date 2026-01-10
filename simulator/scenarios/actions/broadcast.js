/**
 * @fileoverview Broadcast Actions - Atomic operations for broadcast messaging
 *
 * These actions handle broadcast operations through api-ape's public interface.
 * Broadcasts are messages pushed from the server to connected clients.
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/broadcast
 *
 * @example
 * const { broadcast } = require('../actions')
 *
 * // From server: broadcast to all
 * await broadcast.toAll({ server, type: 'announcement', data: { msg: 'hi' } })
 *
 * // From controller via client call: broadcast to others
 * await broadcast.toOthers({ sender: alice, type: 'chat', data: { text: 'hello' } })
 *
 * // Verify receipt
 * await broadcast.expectReceived({ client: bob, type: 'chat' })
 */

/**
 * Broadcast a message to all connected clients from the server
 *
 * Uses the server's broadcast() function directly.
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server instance with broadcast function
 * @param {string} options.type - Message type/event name
 * @param {any} options.data - Data payload to broadcast
 * @returns {Promise<void>}
 *
 * @example
 * await broadcast.toAll({
 *   server,
 *   type: 'announcement',
 *   data: { message: 'Server restarting in 5 minutes' }
 * })
 */
async function toAll({ server, type, data }) {
  if (!server) {
    throw new Error('toAll: server required');
  }
  if (!type) {
    throw new Error('toAll: type required');
  }

  // Use server's broadcast function
  if (typeof server.broadcast === 'function') {
    server.broadcast(type, data);
  } else if (server._ape && typeof server._ape.broadcast === 'function') {
    server._ape.broadcast(type, data);
  } else {
    throw new Error('toAll: server does not have broadcast function');
  }

  // Give time for broadcast to propagate (instant in virtual env)
  await new Promise((r) => setImmediate(r));
}

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
 * const result = await broadcast.toOthers({
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
 * const msg = await broadcast.expectReceived({
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
 * await broadcast.expectReceivedWithData({
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
 * await broadcast.expectNotReceived({
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

/**
 * Get all received messages of a specific type from a client
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to query
 * @param {string} options.type - Message type to filter by
 * @returns {Array<Object>} Array of received messages
 *
 * @example
 * const chatMessages = broadcast.getReceived({ client, type: 'chat' })
 */
function getReceived({ client, type }) {
  if (!client) {
    throw new Error('getReceived: client required');
  }

  if (type) {
    return client.getMessages(type) || [];
  }

  return client.receivedMessages || [];
}

/**
 * Clear all received messages from a client's buffer
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to clear
 * @returns {void}
 *
 * @example
 * broadcast.clearReceived({ client })
 */
function clearReceived({ client }) {
  if (!client) {
    throw new Error('clearReceived: client required');
  }

  client.clearMessages();
}

/**
 * Assert that a client received exactly N messages of a type
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to check
 * @param {string} options.type - Message type
 * @param {number} options.count - Expected count
 * @returns {void}
 *
 * @example
 * await broadcast.assertReceivedCount({ client, type: 'chat', count: 3 })
 */
function assertReceivedCount({ client, type, count }) {
  const messages = getReceived({ client, type });
  if (messages.length !== count) {
    throw new Error(
      `assertReceivedCount: expected ${count} '${type}' messages but got ${messages.length}`
    );
  }
}

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
 * const messages = broadcast.listen({ client, type: 'chat' })
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

/**
 * Set up listeners on multiple clients and return a map of received messages
 *
 * @param {Object} options - Options
 * @param {Object[]} options.clients - Array of clients
 * @param {string} options.type - Message type to listen for
 * @returns {Map<Object, Array<Object>>} Map of client -> received messages
 *
 * @example
 * const receivedMap = broadcast.listenAll({ clients: [alice, bob, charlie], type: 'chat' })
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

/**
 * Wait for all specified clients to receive a broadcast
 *
 * @param {Object} options - Options
 * @param {Object[]} options.clients - Clients that should all receive
 * @param {string} options.type - Message type
 * @param {number} [options.timeout=200] - Timeout per client (ms)
 * @returns {Promise<Array<Object>>} Array of received messages
 *
 * @example
 * const messages = await broadcast.expectAllReceived({
 *   clients: [bob, charlie],
 *   type: 'announcement'
 * })
 */
async function expectAllReceived({ clients, type, timeout = 200 }) {
  if (!Array.isArray(clients)) {
    throw new Error('expectAllReceived: clients array required');
  }

  const promises = clients.map((client) =>
    expectReceived({ client, type, timeout })
  );

  return Promise.all(promises);
}

/**
 * Wait for none of the specified clients to receive a broadcast
 *
 * @param {Object} options - Options
 * @param {Object[]} options.clients - Clients that should NOT receive
 * @param {string} options.type - Message type
 * @param {number} [options.timeout=50] - Wait time (ms)
 * @returns {Promise<void>}
 *
 * @example
 * await broadcast.expectNoneReceived({
 *   clients: [alice], // sender
 *   type: 'message'
 * })
 */
async function expectNoneReceived({ clients, type, timeout = 50 }) {
  if (!Array.isArray(clients)) {
    throw new Error('expectNoneReceived: clients array required');
  }

  const promises = clients.map((client) =>
    expectNotReceived({ client, type, timeout })
  );

  await Promise.all(promises);
}

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
 * const msgs = await broadcast.verifyBroadcastOthers({
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
 * const msgs = await broadcast.verifyBroadcastAll({
 *   clients: [alice, bob, charlie],
 *   type: 'system'
 * })
 */
async function verifyBroadcastAll({ clients, type, timeout = 200 }) {
  return expectAllReceived({ clients, type, timeout });
}

/**
 * Count total broadcasts received across all clients
 *
 * @param {Object} options - Options
 * @param {Object[]} options.clients - Clients to count
 * @param {string} [options.type] - Optional type filter
 * @returns {number} Total message count
 *
 * @example
 * const total = broadcast.countReceived({ clients: [alice, bob], type: 'chat' })
 */
function countReceived({ clients, type }) {
  if (!Array.isArray(clients)) {
    throw new Error('countReceived: clients array required');
  }

  return clients.reduce((sum, client) => {
    const messages = getReceived({ client, type });
    return sum + messages.length;
  }, 0);
}

module.exports = {
  // Sending broadcasts
  toAll,
  toOthers,

  // Expecting/verifying receipt
  expectReceived,
  expectReceivedWithData,
  expectNotReceived,
  expectAllReceived,
  expectNoneReceived,

  // Compound verifications
  verifyBroadcastOthers,
  verifyBroadcastAll,

  // Message management
  getReceived,
  clearReceived,
  countReceived,

  // Listeners
  listen,
  listenAll,

  // Assertions
  assertReceivedCount,
};
