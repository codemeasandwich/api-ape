/**
 * @fileoverview Connection Actions - Atomic operations for connection management
 *
 * These actions handle client connection lifecycle through api-ape's public interface.
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/connection
 *
 * @example
 * const { connection } = require('../actions')
 *
 * const client = await connection.connect({ server })
 * await connection.assertState({ client, state: 'connected' })
 * await connection.disconnect({ client })
 */

/**
 * Connect a client to a server
 *
 * Creates a new client instance and establishes a WebSocket connection.
 * The connection completes immediately in the virtual environment.
 *
 * @param {Object} options - Connection options
 * @param {Object} options.server - Server instance to connect to
 * @param {Object} [options.harness] - Harness instance (uses server's if not provided)
 * @param {string} [options.transport='websocket'] - Transport: 'websocket' or 'polling'
 * @param {Object} [options.cookies] - Cookies to send with connection
 * @param {number} [options.connectTimeout=500] - Connection timeout (ms)
 * @returns {Promise<Object>} Connected client instance
 *
 * @example
 * const client = await connection.connect({ server })
 * expect(client.connected).toBe(true)
 */
async function connect({ server, harness, transport = 'websocket', cookies, connectTimeout = 500 }) {
  // Get harness from server if not provided
  const h = harness || server._harness;
  if (!h) {
    throw new Error('connect: harness required (pass harness or use server from harness)');
  }

  const client = await h.createClientForServer(server, {
    transport,
    cookies,
    connectTimeout,
  });

  // Verify connection established
  if (!client.connected) {
    throw new Error(`connect: client failed to connect to ${server.url}`);
  }

  return client;
}

/**
 * Connect multiple clients to a server
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server instance
 * @param {number} options.count - Number of clients to create
 * @param {Object} [options.harness] - Harness instance
 * @param {string} [options.transport='websocket'] - Transport mode
 * @returns {Promise<Object[]>} Array of connected clients
 *
 * @example
 * const clients = await connection.connectMany({ server, count: 5 })
 */
async function connectMany({ server, count, harness, transport = 'websocket' }) {
  const clients = [];
  for (let i = 0; i < count; i++) {
    const client = await connect({ server, harness, transport });
    clients.push(client);
  }
  return clients;
}

/**
 * Disconnect a client cleanly
 *
 * Performs a graceful WebSocket close handshake.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance to disconnect
 * @returns {Promise<void>}
 *
 * @example
 * await connection.disconnect({ client })
 * expect(client.connected).toBe(false)
 */
async function disconnect({ client }) {
  if (!client) {
    throw new Error('disconnect: client required');
  }

  await client.disconnect();

  // Verify disconnected
  if (client.connected) {
    throw new Error('disconnect: client still connected after disconnect()');
  }
}

/**
 * Force close a client connection (simulate network failure)
 *
 * Abruptly terminates the connection without proper close handshake.
 * This simulates scenarios like network failures or browser crashes.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance to force close
 * @returns {Promise<void>}
 *
 * @example
 * await connection.forceClose({ client })
 */
async function forceClose({ client }) {
  if (!client) {
    throw new Error('forceClose: client required');
  }

  // Access internal socket and terminate without close handshake
  if (client._ws && typeof client._ws.terminate === 'function') {
    client._ws.terminate();
  } else if (client._ws && typeof client._ws.close === 'function') {
    // Fallback: close with error code indicating abnormal closure
    client._ws.close(1006, 'Simulated network failure');
  } else {
    // Last resort: just call disconnect
    await client.disconnect();
  }

  // Give time for close to propagate
  await new Promise((r) => setImmediate(r));
}

/**
 * Reconnect a previously disconnected client
 *
 * Creates a new connection to the same server. Note that this creates
 * a new client ID (api-ape clients don't persist identity across reconnects).
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Previously disconnected client
 * @param {Object} options.server - Server to reconnect to
 * @param {Object} [options.harness] - Harness instance
 * @returns {Promise<Object>} New connected client instance
 *
 * @example
 * await connection.disconnect({ client })
 * const newClient = await connection.reconnect({ client, server })
 */
async function reconnect({ client, server, harness }) {
  // Verify client is disconnected
  if (client && client.connected) {
    throw new Error('reconnect: client is still connected');
  }

  // Create new connection
  return connect({ server, harness });
}

/**
 * Switch transport mid-session
 *
 * Disconnects and reconnects using a different transport.
 * Note: This creates a new client ID.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Current client
 * @param {Object} options.server - Server instance
 * @param {string} options.transport - New transport: 'websocket' or 'polling'
 * @param {Object} [options.harness] - Harness instance
 * @returns {Promise<Object>} New client with different transport
 *
 * @example
 * const pollingClient = await connection.switchTransport({
 *   client,
 *   server,
 *   transport: 'polling'
 * })
 */
async function switchTransport({ client, server, transport, harness }) {
  // Disconnect current client
  if (client && client.connected) {
    await disconnect({ client });
  }

  // Connect with new transport
  return connect({ server, harness, transport });
}

/**
 * Assert client connection state
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to check
 * @param {string} options.state - Expected state: 'connected', 'disconnected', 'connecting'
 * @returns {Promise<void>} Resolves if state matches, throws otherwise
 *
 * @example
 * await connection.assertState({ client, state: 'connected' })
 */
async function assertState({ client, state }) {
  if (!client) {
    throw new Error('assertState: client required');
  }

  const actual = client.state;
  if (actual !== state) {
    throw new Error(`assertState: expected state '${state}' but got '${actual}'`);
  }
}

/**
 * Assert client is connected
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to check
 * @returns {Promise<void>}
 */
async function assertConnected({ client }) {
  if (!client) {
    throw new Error('assertConnected: client required');
  }

  if (!client.connected) {
    throw new Error(`assertConnected: client is not connected (state: ${client.state})`);
  }
}

/**
 * Assert client is disconnected
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to check
 * @returns {Promise<void>}
 */
async function assertDisconnected({ client }) {
  if (!client) {
    throw new Error('assertDisconnected: client required');
  }

  if (client.connected) {
    throw new Error('assertDisconnected: client is still connected');
  }
}

/**
 * Assert transport type
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to check
 * @param {string} options.transport - Expected transport: 'websocket' or 'polling'
 * @returns {Promise<void>}
 *
 * @example
 * await connection.assertTransport({ client, transport: 'websocket' })
 */
async function assertTransport({ client, transport }) {
  if (!client) {
    throw new Error('assertTransport: client required');
  }

  const actual = client.transport;
  if (actual !== transport) {
    throw new Error(`assertTransport: expected '${transport}' but got '${actual}'`);
  }
}

/**
 * Wait for client to reach a specific state
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to monitor
 * @param {string} options.state - State to wait for
 * @param {number} [options.timeout=500] - Timeout in ms
 * @returns {Promise<void>}
 *
 * @example
 * await connection.waitForState({ client, state: 'connected' })
 */
async function waitForState({ client, state, timeout = 500 }) {
  if (!client) {
    throw new Error('waitForState: client required');
  }

  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (client.state === state) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  throw new Error(
    `waitForState: timed out waiting for state '${state}' (current: '${client.state}')`
  );
}

/**
 * Get server's connected client count
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server instance
 * @returns {Promise<number>} Number of connected clients
 *
 * @example
 * const count = await connection.getClientCount({ server })
 */
async function getClientCount({ server }) {
  if (!server) {
    throw new Error('getClientCount: server required');
  }

  return server.clientCount;
}

/**
 * Assert server has expected number of clients
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server instance
 * @param {number} options.count - Expected client count
 * @returns {Promise<void>}
 *
 * @example
 * await connection.assertClientCount({ server, count: 3 })
 */
async function assertClientCount({ server, count }) {
  const actual = await getClientCount({ server });
  if (actual !== count) {
    throw new Error(`assertClientCount: expected ${count} clients but got ${actual}`);
  }
}

/**
 * Wait for server to have a specific number of clients
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server instance
 * @param {number} options.count - Expected client count
 * @param {number} [options.timeout=500] - Timeout in ms
 * @returns {Promise<void>}
 *
 * @example
 * await connection.waitForClientCount({ server, count: 5 })
 */
async function waitForClientCount({ server, count, timeout = 500 }) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (server.clientCount >= count) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  throw new Error(
    `waitForClientCount: timed out waiting for ${count} clients (current: ${server.clientCount})`
  );
}

module.exports = {
  // Core connection operations
  connect,
  connectMany,
  disconnect,
  forceClose,
  reconnect,
  switchTransport,

  // State assertions
  assertState,
  assertConnected,
  assertDisconnected,
  assertTransport,

  // Waiting utilities
  waitForState,
  waitForClientCount,

  // Server queries
  getClientCount,
  assertClientCount,
};
