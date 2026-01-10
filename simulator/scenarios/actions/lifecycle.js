/**
 * @fileoverview Lifecycle Actions - Atomic operations for connection lifecycle hooks
 *
 * These actions test api-ape's connection lifecycle through the public interface:
 * - onConnect: Called when client connects, can return embed values and hooks
 * - embed: Custom values available as `this.*` in controllers
 * - onReceive/onSend/onError: Message lifecycle hooks
 * - onDisconnect: Called when client disconnects
 *
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/lifecycle
 *
 * @example
 * const { lifecycle } = require('../actions')
 *
 * const { server, events } = await lifecycle.createServerWithEmbed({
 *   harness,
 *   embed: { userId: '123', role: 'admin' }
 * })
 *
 * const client = await lifecycle.connectAndVerifyEmbed({
 *   server,
 *   embedKey: 'userId',
 *   expectedValue: '123'
 * })
 */

/**
 * Create a server with custom onConnect handler that sets embed values
 *
 * The embed values will be available as `this.*` in all controllers.
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Object|Function} options.embed - Embed object or function(socket, req) => embed
 * @param {string} [options.where='controllers'] - Controller directory
 * @param {Function} [options.onReceive] - Optional onReceive hook
 * @param {Function} [options.onSend] - Optional onSend hook
 * @param {Function} [options.onError] - Optional onError hook
 * @param {Function} [options.onDisconnect] - Optional onDisconnect hook
 * @returns {Promise<{server: Object, events: Object}>} Server and event tracker
 *
 * @example
 * const { server, events } = await lifecycle.createServerWithEmbed({
 *   harness,
 *   embed: { userId: 'user-123', role: 'admin' }
 * })
 */
async function createServerWithEmbed({
  harness,
  embed,
  where = 'controllers',
  onReceive,
  onSend,
  onError,
  onDisconnect,
}) {
  if (!harness) {
    throw new Error('createServerWithEmbed: harness required');
  }

  // Event tracker to record lifecycle events
  const events = {
    connections: [],
    disconnections: [],
    receives: [],
    sends: [],
    errors: [],
  };

  // Build onConnect handler
  const onConnectHandler = (socket, req, send) => {
    const connectionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    // Resolve embed value
    const embedValue = typeof embed === 'function' ? embed(socket, req, send) : embed;

    // Track connection
    events.connections.push({
      connectionId,
      timestamp: Date.now(),
      headers: req.headers,
    });

    return {
      embed: embedValue || {},

      onReceive: (queryId, data, type) => {
        events.receives.push({ connectionId, queryId, data, type, timestamp: Date.now() });
        if (onReceive) {
          return onReceive(queryId, data, type);
        }
      },

      onSend: (data, type) => {
        events.sends.push({ connectionId, data, type, timestamp: Date.now() });
        if (onSend) {
          return onSend(data, type);
        }
      },

      onError: (errStr) => {
        events.errors.push({ connectionId, error: errStr, timestamp: Date.now() });
        if (onError) {
          onError(errStr);
        }
      },

      onDisconnect: () => {
        events.disconnections.push({ connectionId, timestamp: Date.now() });
        if (onDisconnect) {
          onDisconnect();
        }
      },
    };
  };

  const server = await harness.createServer({
    where,
    onConnect: onConnectHandler,
  });

  // Store harness reference for later use
  server._harness = harness;

  return { server, events };
}

/**
 * Create a server with dynamic embed based on request
 *
 * Useful for testing user-specific embed values from cookies, headers, etc.
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Function} options.embedFromRequest - Function (req) => embed
 * @param {string} [options.where='controllers'] - Controller directory
 * @returns {Promise<{server: Object, events: Object}>}
 *
 * @example
 * const { server, events } = await lifecycle.createServerWithDynamicEmbed({
 *   harness,
 *   embedFromRequest: (req) => ({
 *     userId: extractUserIdFromCookie(req.headers.cookie)
 *   })
 * })
 */
async function createServerWithDynamicEmbed({ harness, embedFromRequest, where = 'controllers' }) {
  if (typeof embedFromRequest !== 'function') {
    throw new Error('createServerWithDynamicEmbed: embedFromRequest function required');
  }

  return createServerWithEmbed({
    harness,
    where,
    embed: (socket, req) => embedFromRequest(req),
  });
}

/**
 * Create a server that sends a welcome message on connect
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {string} options.welcomeType - Message type for welcome
 * @param {any} options.welcomeData - Data to send in welcome message
 * @param {Object} [options.embed] - Optional embed values
 * @param {string} [options.where='controllers'] - Controller directory
 * @returns {Promise<{server: Object, events: Object}>}
 *
 * @example
 * const { server } = await lifecycle.createServerWithWelcome({
 *   harness,
 *   welcomeType: 'welcome',
 *   welcomeData: { message: 'Hello!' }
 * })
 */
async function createServerWithWelcome({
  harness,
  welcomeType,
  welcomeData,
  embed,
  where = 'controllers',
}) {
  if (!harness) {
    throw new Error('createServerWithWelcome: harness required');
  }
  if (!welcomeType) {
    throw new Error('createServerWithWelcome: welcomeType required');
  }

  const events = {
    connections: [],
    disconnections: [],
    welcomesSent: [],
  };

  const onConnectHandler = (socket, req, send) => {
    const connectionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    events.connections.push({ connectionId, timestamp: Date.now() });

    // Send welcome message
    send(welcomeType, welcomeData);
    events.welcomesSent.push({ connectionId, type: welcomeType, data: welcomeData, timestamp: Date.now() });

    const embedValue = typeof embed === 'function' ? embed(socket, req, send) : embed;

    return {
      embed: embedValue || {},
      onDisconnect: () => {
        events.disconnections.push({ connectionId, timestamp: Date.now() });
      },
    };
  };

  const server = await harness.createServer({
    where,
    onConnect: onConnectHandler,
  });

  server._harness = harness;

  return { server, events };
}

/**
 * Connect a client and verify it receives a welcome message
 *
 * @param {Object} options - Options
 * @param {Object} options.server - Server instance
 * @param {string} options.welcomeType - Expected welcome message type
 * @param {number} [options.timeout=200] - Timeout for welcome (ms)
 * @returns {Promise<{client: Object, welcome: Object}>} Client and welcome message
 *
 * @example
 * const { client, welcome } = await lifecycle.connectAndExpectWelcome({
 *   server,
 *   welcomeType: 'welcome'
 * })
 */
async function connectAndExpectWelcome({ server, welcomeType, timeout = 200 }) {
  if (!server) {
    throw new Error('connectAndExpectWelcome: server required');
  }

  const harness = server._harness;
  if (!harness) {
    throw new Error('connectAndExpectWelcome: server missing harness reference');
  }

  const client = await harness.createClientForServer(server);

  // Wait for welcome message
  const welcome = await client.waitFor(welcomeType, timeout);

  return { client, welcome };
}

/**
 * Verify embed values are accessible in a controller
 *
 * Calls an endpoint that returns `this.*` values and checks they match embed.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Connected client
 * @param {string} options.endpoint - Endpoint that returns embed values (e.g., 'profile')
 * @param {string} options.embedKey - Key to check in response
 * @param {any} [options.expectedValue] - Expected value (if provided, asserts match)
 * @returns {Promise<any>} The embed value from the controller
 *
 * @example
 * const userId = await lifecycle.verifyEmbed({
 *   client,
 *   endpoint: 'profile',
 *   embedKey: 'userId',
 *   expectedValue: '123'
 * })
 */
async function verifyEmbed({ client, endpoint, embedKey, expectedValue }) {
  if (!client) {
    throw new Error('verifyEmbed: client required');
  }
  if (!endpoint) {
    throw new Error('verifyEmbed: endpoint required');
  }
  if (!embedKey) {
    throw new Error('verifyEmbed: embedKey required');
  }

  const result = await client.call(endpoint, {});

  const actualValue = result?.[embedKey];

  if (expectedValue !== undefined) {
    const actualStr = JSON.stringify(actualValue);
    const expectedStr = JSON.stringify(expectedValue);
    if (actualStr !== expectedStr) {
      throw new Error(
        `verifyEmbed: expected ${embedKey}=${expectedStr} but got ${embedKey}=${actualStr}`
      );
    }
  }

  return actualValue;
}

/**
 * Track lifecycle events for a server over a period
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object from createServerWithEmbed
 * @returns {Object} Snapshot of current events
 *
 * @example
 * const snapshot = lifecycle.getEventSnapshot({ events })
 */
function getEventSnapshot({ events }) {
  return {
    connectionCount: events.connections.length,
    disconnectionCount: events.disconnections.length,
    receiveCount: events.receives.length,
    sendCount: events.sends.length,
    errorCount: events.errors.length,
    connections: [...events.connections],
    disconnections: [...events.disconnections],
    receives: [...events.receives],
    sends: [...events.sends],
    errors: [...events.errors],
  };
}

/**
 * Assert that onConnect was called N times
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object
 * @param {number} options.count - Expected connection count
 * @returns {void}
 */
function assertConnectionCount({ events, count }) {
  if (events.connections.length !== count) {
    throw new Error(
      `assertConnectionCount: expected ${count} connections but got ${events.connections.length}`
    );
  }
}

/**
 * Assert that onDisconnect was called N times
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object
 * @param {number} options.count - Expected disconnection count
 * @returns {void}
 */
function assertDisconnectionCount({ events, count }) {
  if (events.disconnections.length !== count) {
    throw new Error(
      `assertDisconnectionCount: expected ${count} disconnections but got ${events.disconnections.length}`
    );
  }
}

/**
 * Wait for a specific number of connections
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object
 * @param {number} options.count - Expected connection count
 * @param {number} [options.timeout=500] - Timeout (ms)
 * @returns {Promise<void>}
 */
async function waitForConnections({ events, count, timeout = 500 }) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (events.connections.length >= count) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(
    `waitForConnections: timed out waiting for ${count} connections (got ${events.connections.length})`
  );
}

/**
 * Wait for a specific number of disconnections
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object
 * @param {number} options.count - Expected disconnection count
 * @param {number} [options.timeout=500] - Timeout (ms)
 * @returns {Promise<void>}
 */
async function waitForDisconnections({ events, count, timeout = 500 }) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (events.disconnections.length >= count) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(
    `waitForDisconnections: timed out waiting for ${count} disconnections (got ${events.disconnections.length})`
  );
}

/**
 * Verify onDisconnect fires when client disconnects
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to disconnect
 * @param {Object} options.events - Events object to check
 * @param {number} [options.timeout=200] - Timeout for disconnect event (ms)
 * @returns {Promise<void>}
 *
 * @example
 * await lifecycle.verifyDisconnect({ client, events })
 */
async function verifyDisconnect({ client, events, timeout = 200 }) {
  const countBefore = events.disconnections.length;

  await client.disconnect();

  // Wait for onDisconnect to fire
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (events.disconnections.length > countBefore) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  throw new Error(
    `verifyDisconnect: onDisconnect not fired within ${timeout}ms`
  );
}

/**
 * Verify onReceive fires when client sends a message
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to send from
 * @param {string} options.endpoint - Endpoint to call
 * @param {any} options.data - Data to send
 * @param {Object} options.events - Events object
 * @param {number} [options.timeout=200] - Timeout (ms)
 * @returns {Promise<Object>} The receive event
 */
async function verifyReceiveHook({ client, endpoint, data, events, timeout = 200 }) {
  const countBefore = events.receives.length;

  await client.call(endpoint, data);

  // Check if receive was logged
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (events.receives.length > countBefore) {
      return events.receives[events.receives.length - 1];
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  throw new Error(
    `verifyReceiveHook: onReceive not fired within ${timeout}ms`
  );
}

/**
 * Clear all tracked events
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object to clear
 * @returns {void}
 */
function clearEvents({ events }) {
  events.connections.length = 0;
  events.disconnections.length = 0;
  events.receives.length = 0;
  events.sends.length = 0;
  events.errors.length = 0;
}

/**
 * Create a test scenario with full lifecycle tracking
 *
 * Sets up server with all hooks tracked and returns helper functions.
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Object} [options.embed] - Embed values
 * @param {string} [options.where='controllers'] - Controller directory
 * @returns {Promise<Object>} Test context with server, events, and helpers
 *
 * @example
 * const ctx = await lifecycle.createTestContext({ harness, embed: { userId: '123' } })
 * const client = await ctx.connectClient()
 * await ctx.assertConnected(1)
 * await client.disconnect()
 * await ctx.assertDisconnected(1)
 */
async function createTestContext({ harness, embed, where = 'controllers' }) {
  const { server, events } = await createServerWithEmbed({
    harness,
    embed,
    where,
  });

  return {
    server,
    events,

    async connectClient(options = {}) {
      return harness.createClientForServer(server, options);
    },

    assertConnected(count) {
      assertConnectionCount({ events, count });
    },

    assertDisconnected(count) {
      assertDisconnectionCount({ events, count });
    },

    async waitConnected(count, timeout = 500) {
      return waitForConnections({ events, count, timeout });
    },

    async waitDisconnected(count, timeout = 500) {
      return waitForDisconnections({ events, count, timeout });
    },

    getSnapshot() {
      return getEventSnapshot({ events });
    },

    clear() {
      clearEvents({ events });
    },
  };
}

module.exports = {
  // Server creation with lifecycle hooks
  createServerWithEmbed,
  createServerWithDynamicEmbed,
  createServerWithWelcome,

  // Connection with verification
  connectAndExpectWelcome,

  // Embed verification
  verifyEmbed,

  // Event tracking
  getEventSnapshot,
  clearEvents,

  // Assertions
  assertConnectionCount,
  assertDisconnectionCount,

  // Waiting utilities
  waitForConnections,
  waitForDisconnections,

  // Hook verification
  verifyDisconnect,
  verifyReceiveHook,

  // Test context helper
  createTestContext,
};
