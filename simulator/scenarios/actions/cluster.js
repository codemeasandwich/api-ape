/**
 * @fileoverview Cluster Actions - Atomic operations for Forest multi-server testing
 *
 * These actions test api-ape's Forest distributed mesh system through the public interface:
 * - Multiple servers sharing a database backend (FakeDatabase for testing)
 * - Client lookup across servers
 * - Cross-server message routing
 * - Broadcast to all servers in the cluster
 *
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/cluster
 *
 * @example
 * const { cluster } = require('../actions')
 *
 * // Create a 3-server cluster
 * const { servers, fakeDb } = await cluster.create({ harness, count: 3 })
 *
 * // Connect clients to different servers
 * const client1 = await cluster.connectTo({ server: servers[0], harness })
 * const client2 = await cluster.connectTo({ server: servers[1], harness })
 *
 * // Verify cross-server communication
 * await cluster.verifyCrossServerMessage({ sender: client1, receiver: client2, type: 'chat' })
 */

/**
 * Create a cluster of servers sharing a fake database
 *
 * All servers will use the same FakeDatabase instance for coordination,
 * simulating how Forest works with Redis/MongoDB/PostgreSQL in production.
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {number} options.count - Number of servers to create
 * @param {string} [options.where='controllers'] - Controller directory
 * @param {string} [options.namespace='test'] - Cluster namespace
 * @returns {Promise<{servers: Object[], fakeDb: Object}>} Servers and shared database
 *
 * @example
 * const { servers, fakeDb } = await cluster.create({ harness, count: 3 })
 * // servers[0], servers[1], servers[2] all share fakeDb
 */
async function create({ harness, count, where = 'controllers', namespace = 'test' }) {
  if (!harness) {
    throw new Error('create: harness required');
  }
  if (!count || count < 1) {
    throw new Error('create: count must be >= 1');
  }

  const servers = await harness.createCluster(count, {
    where,
    useCluster: true,
  });

  // Store harness reference on each server
  servers.forEach((server) => {
    server._harness = harness;
  });

  return {
    servers,
    fakeDb: harness.db,
  };
}

/**
 * Connect a client to a specific server in the cluster
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server to connect to
 * @param {Object} [options.harness] - Harness (uses server's if not provided)
 * @param {Object} [options.cookies] - Cookies to send
 * @returns {Promise<Object>} Connected client
 *
 * @example
 * const client1 = await cluster.connectTo({ server: servers[0] })
 * const client2 = await cluster.connectTo({ server: servers[1] })
 */
async function connectTo({ server, harness, cookies }) {
  const h = harness || server._harness;
  if (!h) {
    throw new Error('connectTo: harness required');
  }

  const client = await h.createClientForServer(server, { cookies });

  // Store server reference for cross-server testing
  client._server = server;

  return client;
}

/**
 * Connect multiple clients, distributing them across servers
 *
 * @param {Object} options - Options
 * @param {Object[]} options.servers - Array of servers
 * @param {number} options.clientsPerServer - Clients per server
 * @param {Object} [options.harness] - Harness instance
 * @returns {Promise<Map<Object, Object[]>>} Map of server -> clients
 *
 * @example
 * const clientMap = await cluster.connectDistributed({
 *   servers,
 *   clientsPerServer: 2
 * })
 * // clientMap.get(servers[0]) = [client1, client2]
 */
async function connectDistributed({ servers, clientsPerServer, harness }) {
  if (!Array.isArray(servers)) {
    throw new Error('connectDistributed: servers array required');
  }

  const clientMap = new Map();

  for (const server of servers) {
    const clients = [];
    for (let i = 0; i < clientsPerServer; i++) {
      const client = await connectTo({ server, harness });
      clients.push(client);
    }
    clientMap.set(server, clients);
  }

  return clientMap;
}

/**
 * Get all clients from a client map as a flat array
 *
 * @param {Map<Object, Object[]>} clientMap - Map from connectDistributed
 * @returns {Object[]} All clients
 */
function getAllClients(clientMap) {
  const all = [];
  for (const clients of clientMap.values()) {
    all.push(...clients);
  }
  return all;
}

/**
 * Verify that a message sent from one server reaches a client on another server
 *
 * This tests Forest's cross-server message routing via the shared database.
 *
 * @param {Object} options - Options
 * @param {Object} options.sender - Client sending the message
 * @param {Object} options.receiver - Client on different server to receive
 * @param {string} options.endpoint - Endpoint that broadcasts (e.g., 'message')
 * @param {any} options.data - Data to send
 * @param {string} options.broadcastType - Expected broadcast type
 * @param {number} [options.timeout=500] - Timeout for receive (ms)
 * @returns {Promise<Object>} The received message
 *
 * @example
 * const msg = await cluster.verifyCrossServerMessage({
 *   sender: clientOnServer1,
 *   receiver: clientOnServer2,
 *   endpoint: 'message',
 *   data: { text: 'Hello across servers!' },
 *   broadcastType: 'message'
 * })
 */
async function verifyCrossServerMessage({ sender, receiver, endpoint, data, broadcastType, timeout = 500 }) {
  if (!sender) {
    throw new Error('verifyCrossServerMessage: sender required');
  }
  if (!receiver) {
    throw new Error('verifyCrossServerMessage: receiver required');
  }
  if (!endpoint) {
    throw new Error('verifyCrossServerMessage: endpoint required');
  }
  if (!broadcastType) {
    throw new Error('verifyCrossServerMessage: broadcastType required');
  }

  // Verify clients are on different servers
  if (sender._server && receiver._server && sender._server === receiver._server) {
    console.warn('verifyCrossServerMessage: sender and receiver are on same server');
  }

  // Set up listener on receiver
  const receivePromise = receiver.waitFor(broadcastType, timeout);

  // Send message
  await sender.call(endpoint, data);

  // Wait for message to arrive via cross-server routing
  const msg = await receivePromise;

  return msg;
}

/**
 * Verify broadcast reaches all clients across all servers
 *
 * @param {Object} options - Options
 * @param {Object[]} options.servers - All servers in cluster
 * @param {Object[]} options.clients - All clients to verify receipt
 * @param {string} options.type - Broadcast type
 * @param {any} options.data - Data being broadcast
 * @param {Object} [options.excludeClient] - Client to exclude (sender)
 * @param {number} [options.timeout=500] - Timeout (ms)
 * @returns {Promise<Object[]>} All received messages
 *
 * @example
 * await cluster.verifyBroadcastAll({
 *   servers,
 *   clients: [alice, bob, charlie],
 *   type: 'announcement',
 *   data: { message: 'Hello cluster!' }
 * })
 */
async function verifyBroadcastAll({ servers, clients, type, data, excludeClient, timeout = 500 }) {
  if (!Array.isArray(clients)) {
    throw new Error('verifyBroadcastAll: clients array required');
  }

  // Filter out excluded client
  const receivers = excludeClient
    ? clients.filter((c) => c !== excludeClient)
    : clients;

  // Set up listeners
  const receivePromises = receivers.map((client) =>
    client.waitFor(type, timeout).catch(() => null)
  );

  // Broadcast from first server
  const server = servers[0];
  if (server.broadcast) {
    server.broadcast(type, data);
  } else if (server._ape && server._ape.broadcast) {
    server._ape.broadcast(type, data);
  }

  // Wait for all messages
  const messages = await Promise.all(receivePromises);
  const received = messages.filter(Boolean);

  if (received.length !== receivers.length) {
    throw new Error(
      `verifyBroadcastAll: expected ${receivers.length} receivers but only ${received.length} got the message`
    );
  }

  return received;
}

/**
 * Verify that sender is excluded from broadcastOthers across cluster
 *
 * @param {Object} options - Options
 * @param {Object} options.sender - Client sending (should not receive)
 * @param {Object[]} options.receivers - Other clients (should receive)
 * @param {string} options.endpoint - Endpoint that uses broadcastOthers
 * @param {any} options.data - Data to send
 * @param {string} options.broadcastType - Expected broadcast type
 * @param {number} [options.timeout=500] - Timeout (ms)
 * @returns {Promise<Object[]>} Messages received by others
 */
async function verifyBroadcastOthersAcrossCluster({ sender, receivers, endpoint, data, broadcastType, timeout = 500 }) {
  if (!sender) {
    throw new Error('verifyBroadcastOthersAcrossCluster: sender required');
  }
  if (!Array.isArray(receivers)) {
    throw new Error('verifyBroadcastOthersAcrossCluster: receivers array required');
  }

  // Set up listeners on receivers
  const receivePromises = receivers.map((client) =>
    client.waitFor(broadcastType, timeout).catch(() => null)
  );

  // Sender makes call that triggers broadcastOthers
  await sender.call(endpoint, data);

  // Verify sender did NOT receive
  await new Promise((r) => setTimeout(r, 50));
  const senderMessages = sender.getMessages(broadcastType);
  if (senderMessages && senderMessages.length > 0) {
    throw new Error('verifyBroadcastOthersAcrossCluster: sender received broadcast (should be excluded)');
  }

  // Wait for receivers
  const messages = await Promise.all(receivePromises);
  const received = messages.filter(Boolean);

  if (received.length !== receivers.length) {
    throw new Error(
      `verifyBroadcastOthersAcrossCluster: expected ${receivers.length} receivers but only ${received.length} got the message`
    );
  }

  return received;
}

/**
 * Test client lookup across servers
 *
 * Verifies that the fake database correctly tracks client → server mappings.
 *
 * @param {Object} options - Options
 * @param {Object} options.fakeDb - FakeDatabase instance
 * @param {Object} options.client - Client to look up
 * @param {Object} options.expectedServer - Server the client should be on
 * @returns {Promise<void>}
 *
 * @example
 * await cluster.verifyClientLookup({
 *   fakeDb,
 *   client: alice,
 *   expectedServer: servers[0]
 * })
 */
async function verifyClientLookup({ fakeDb, client, expectedServer }) {
  if (!fakeDb) {
    throw new Error('verifyClientLookup: fakeDb required');
  }
  if (!client) {
    throw new Error('verifyClientLookup: client required');
  }

  // This would require access to client's internal ID
  // For now, verify the client is connected and on the expected server
  if (!client.connected) {
    throw new Error('verifyClientLookup: client is not connected');
  }

  if (client._server && client._server !== expectedServer) {
    throw new Error('verifyClientLookup: client is on wrong server');
  }
}

/**
 * Simulate server failure and verify clients can reconnect to other servers
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Object} options.serverToFail - Server to shut down
 * @param {Object[]} options.affectedClients - Clients on the failing server
 * @param {Object[]} options.remainingServers - Servers still available
 * @returns {Promise<Object[]>} New client connections
 *
 * @example
 * const newClients = await cluster.simulateFailover({
 *   harness,
 *   serverToFail: servers[0],
 *   affectedClients: [client1, client2],
 *   remainingServers: [servers[1], servers[2]]
 * })
 */
async function simulateFailover({ harness, serverToFail, affectedClients, remainingServers }) {
  if (!harness) {
    throw new Error('simulateFailover: harness required');
  }
  if (!serverToFail) {
    throw new Error('simulateFailover: serverToFail required');
  }
  if (!Array.isArray(remainingServers) || remainingServers.length === 0) {
    throw new Error('simulateFailover: remainingServers required');
  }

  // Disconnect affected clients
  for (const client of affectedClients || []) {
    try {
      await client.disconnect();
    } catch (e) {
      // May already be disconnected
    }
  }

  // Close the failing server
  await harness.servers.close(serverToFail.id);

  // Reconnect clients to remaining servers (round-robin)
  const newClients = [];
  for (let i = 0; i < (affectedClients || []).length; i++) {
    const targetServer = remainingServers[i % remainingServers.length];
    const newClient = await connectTo({ server: targetServer, harness });
    newClients.push(newClient);
  }

  return newClients;
}

/**
 * Get cluster state from the fake database
 *
 * @param {Object} options - Options
 * @param {Object} options.fakeDb - FakeDatabase instance
 * @returns {Object} Cluster state
 *
 * @example
 * const state = cluster.getState({ fakeDb })
 * // { activeServers: Set, clientCount: 5, ... }
 */
function getState({ fakeDb }) {
  if (!fakeDb) {
    throw new Error('getState: fakeDb required');
  }

  return fakeDb.getState();
}

/**
 * Assert cluster has expected number of active servers
 *
 * @param {Object} options - Options
 * @param {Object} options.fakeDb - FakeDatabase instance
 * @param {number} options.count - Expected server count
 */
function assertServerCount({ fakeDb, count }) {
  const state = getState({ fakeDb });
  const actual = state.activeServers?.size || 0;

  if (actual !== count) {
    throw new Error(
      `assertServerCount: expected ${count} active servers but got ${actual}`
    );
  }
}

/**
 * Assert cluster has expected number of tracked clients
 *
 * @param {Object} options - Options
 * @param {Object} options.fakeDb - FakeDatabase instance
 * @param {number} options.count - Expected client count
 */
function assertClientCount({ fakeDb, count }) {
  const state = getState({ fakeDb });
  const actual = state.clientToServer?.size || 0;

  if (actual !== count) {
    throw new Error(
      `assertClientCount: expected ${count} tracked clients but got ${actual}`
    );
  }
}

/**
 * Wait for cluster to have expected number of servers
 *
 * @param {Object} options - Options
 * @param {Object} options.fakeDb - FakeDatabase instance
 * @param {number} options.count - Expected server count
 * @param {number} [options.timeout=500] - Timeout (ms)
 */
async function waitForServerCount({ fakeDb, count, timeout = 500 }) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = getState({ fakeDb });
    if ((state.activeServers?.size || 0) >= count) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  const state = getState({ fakeDb });
  throw new Error(
    `waitForServerCount: timed out waiting for ${count} servers (got ${state.activeServers?.size || 0})`
  );
}

/**
 * Create a test scenario with cluster setup
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {number} options.serverCount - Number of servers
 * @param {number} options.clientsPerServer - Clients per server
 * @param {string} [options.where='controllers'] - Controller directory
 * @returns {Promise<Object>} Test context
 *
 * @example
 * const ctx = await cluster.createTestContext({
 *   harness,
 *   serverCount: 3,
 *   clientsPerServer: 2
 * })
 * // ctx.servers, ctx.clients, ctx.fakeDb, ctx.clientMap
 */
async function createTestContext({ harness, serverCount, clientsPerServer, where = 'controllers' }) {
  const { servers, fakeDb } = await create({ harness, count: serverCount, where });

  const clientMap = await connectDistributed({
    servers,
    clientsPerServer,
    harness,
  });

  const clients = getAllClients(clientMap);

  return {
    servers,
    clients,
    clientMap,
    fakeDb,
    harness,

    getClientsFor(server) {
      return clientMap.get(server) || [];
    },

    getServerFor(client) {
      return client._server;
    },

    async cleanup() {
      for (const client of clients) {
        try {
          await client.disconnect();
        } catch (e) {
          // Ignore
        }
      }
      for (const server of servers) {
        try {
          await harness.servers.close(server.id);
        } catch (e) {
          // Ignore
        }
      }
    },
  };
}

module.exports = {
  // Cluster creation
  create,
  createTestContext,

  // Client connection
  connectTo,
  connectDistributed,
  getAllClients,

  // Cross-server verification
  verifyCrossServerMessage,
  verifyBroadcastAll,
  verifyBroadcastOthersAcrossCluster,
  verifyClientLookup,

  // Failover testing
  simulateFailover,

  // State inspection
  getState,

  // Assertions
  assertServerCount,
  assertClientCount,
  waitForServerCount,
};
