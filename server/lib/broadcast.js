/**
 * @fileoverview Client Tracking and Broadcast Utilities for api-ape Server
 *
 * This module provides the infrastructure for tracking connected WebSocket clients
 * and broadcasting messages to them. It serves as the central hub for client
 * management and real-time communication.
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    Broadcast Module                         │
 * ├─────────────────────────────────────────────────────────────┤
 * │                                                             │
 * │  ┌─────────────┐    ┌─────────────────────────────────┐    │
 * │  │  _clients   │    │         ClientWrapper            │    │
 * │  │   (Map)     │───►│  - clientId                      │    │
 * │  │             │    │  - sessionId                     │    │
 * │  │ Internal    │    │  - embed (custom data)           │    │
 * │  │ Storage     │    │  - agent (user-agent info)       │    │
 * │  └─────────────┘    │  - sendTo(type, data)            │    │
 * │        │            └─────────────────────────────────┘    │
 * │        │                                                    │
 * │        ▼                                                    │
 * │  ┌─────────────┐                                           │
 * │  │   clients   │  Read-only Proxy                          │
 * │  │   (Proxy)   │  - get, has, keys, values, entries ✓     │
 * │  │             │  - set, delete, clear ✗ (throws)          │
 * │  └─────────────┘                                           │
 * │                                                             │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Client Lifecycle
 *
 * 1. **Connection**: `addClient()` called from wiring.js when WebSocket connects
 * 2. **Active**: Client is in the Map, can receive broadcasts and direct messages
 * 3. **Disconnection**: `removeClient()` called when WebSocket closes
 *
 * ## Security
 *
 * The `clients` Map is exposed as a read-only Proxy to prevent external code
 * from modifying the client collection. Only internal api-ape code can add
 * or remove clients.
 *
 * @module server/lib/broadcast
 * @see {@link module:server/lib/wiring} for WebSocket connection handling
 * @see {@link module:server/lib/longPolling} for HTTP streaming client handling
 *
 * @example <caption>Broadcasting to all clients</caption>
 * const { broadcast, clients } = require('./broadcast')
 *
 * // Send notification to everyone
 * broadcast('notification', { message: 'Server maintenance in 5 minutes' })
 *
 * // Check how many clients will receive it
 * console.log(`Broadcasting to ${clients.size} clients`)
 *
 * @example <caption>Broadcasting with exclusion</caption>
 * const { broadcast } = require('./broadcast')
 *
 * // In a chat handler - broadcast to everyone except sender
 * function handleChat(data) {
 *   // this.clientId is available in controller context
 *   broadcast('chat', {
 *     user: data.user,
 *     message: data.text
 *   }, this.clientId)  // Exclude sender
 * }
 *
 * @example <caption>Sending to specific client</caption>
 * const { clients } = require('./broadcast')
 *
 * // Find and message a specific client
 * const client = clients.get(targetClientId)
 * if (client) {
 *   client.sendTo('private-message', {
 *     from: senderId,
 *     text: 'Hello!'
 *   })
 * }
 *
 * @example <caption>Iterating over clients</caption>
 * const { clients } = require('./broadcast')
 *
 * // Get all client IDs
 * const clientIds = [...clients.keys()]
 *
 * // Filter clients by embed data
 * for (const client of clients.values()) {
 *   if (client.embed?.role === 'admin') {
 *     client.sendTo('admin-alert', { level: 'high' })
 *   }
 * }
 */

/**
 * Internal Map of connected clients
 *
 * Maps clientId strings to ClientWrapper objects. This is the actual
 * storage - the exported `clients` is a read-only Proxy over this Map.
 *
 * @type {Map<string, ClientWrapper>}
 * @private
 */
const _clients = new Map();

/**
 * @typedef {Object} ClientInfo
 * @description Raw client information passed from wiring.js or longPolling.js
 * @property {string} clientId - Unique identifier for this client connection
 * @property {string|null} sessionId - Session ID from cookies (if available)
 * @property {Object} [agent] - Parsed user-agent information
 * @property {string} [agent.browser] - Browser name
 * @property {string} [agent.os] - Operating system
 * @property {Object} [embed] - Custom values from onConnect handler
 * @property {Function|null} send - Function to send messages to this client
 */

/**
 * @typedef {Object} ClientWrapper
 * @description Public interface for interacting with a connected client
 * @property {string} clientId - Unique identifier for this client (read-only)
 * @property {string|null} sessionId - Session ID from cookies (read-only)
 * @property {Object} embed - Custom embedded values from onConnect (read-only)
 * @property {Object} agent - Parsed user-agent information (read-only)
 * @property {Function} sendTo - Send a message to this specific client
 */

/**
 * Create a ClientWrapper that exposes client info and sendTo function
 *
 * The wrapper provides a clean public interface while keeping the raw
 * client info protected. Properties are exposed as getters to ensure
 * they reflect current values (especially for embed which may be updated).
 *
 * @param {ClientInfo} clientInfo - Raw client info from wiring/longPolling
 * @returns {ClientWrapper} Public client interface
 * @private
 *
 * @example
 * const wrapper = createClientWrapper({
 *   clientId: 'abc123',
 *   sessionId: 'sess_xyz',
 *   agent: { browser: { name: 'Chrome' } },
 *   embed: { userId: 42 },
 *   send: (err, type, data, flag) => { ... }
 * })
 *
 * // Use the wrapper
 * wrapper.sendTo('greeting', { text: 'Hello!' })
 * console.log(wrapper.clientId)  // 'abc123'
 * console.log(wrapper.embed)     // { userId: 42 }
 */
function createClientWrapper(clientInfo) {
  return {
    /**
     * Unique client identifier
     * @type {string}
     * @readonly
     */
    get clientId() {
      return clientInfo.clientId;
    },

    /**
     * Session ID from cookies (set by outer framework like Express)
     * @type {string|null}
     * @readonly
     */
    get sessionId() {
      return clientInfo.sessionId || null;
    },

    /**
     * Custom embedded values set by onConnect handler
     *
     * These values are available in all controller invocations for this client.
     * Common uses include userId, permissions, or other session-specific data.
     *
     * @type {Object}
     * @readonly
     *
     * @example
     * // In onConnect:
     * onConnect: (socket, req, send) => ({
     *   embed: { userId: getUserFromSession(req), role: 'user' }
     * })
     *
     * // Later, access via client wrapper:
     * client.embed.userId  // The embedded userId
     */
    get embed() {
      return clientInfo.embed || {};
    },

    /**
     * Parsed user-agent information
     *
     * Contains browser, OS, device, and other information parsed from
     * the User-Agent header at connection time.
     *
     * @type {Object}
     * @readonly
     *
     * @property {Object} [browser] - Browser information
     * @property {string} [browser.name] - Browser name (Chrome, Firefox, etc.)
     * @property {string} [browser.version] - Browser version
     * @property {Object} [os] - Operating system information
     * @property {string} [os.name] - OS name (Windows, macOS, Linux, etc.)
     * @property {Object} [device] - Device information
     * @property {string} [device.type] - Device type (mobile, tablet, desktop)
     * @property {boolean} [isBot] - Whether this appears to be a bot/crawler
     */
    get agent() {
      return clientInfo.agent || {};
    },

    /**
     * Send a message to this specific client
     *
     * Delivers a typed message directly to this client's WebSocket connection.
     * This is useful for private messages or client-specific updates.
     *
     * @param {string} type - Message type identifier (e.g., 'notification', 'update')
     * @param {any} data - Data payload to send (will be serialized with JSS)
     * @returns {void}
     *
     * @example
     * // Send a notification to this client
     * client.sendTo('notification', {
     *   title: 'New Message',
     *   body: 'You have a new message from Alice'
     * })
     *
     * @example
     * // Send structured data
     * client.sendTo('user-update', {
     *   userId: 123,
     *   changes: { status: 'online', lastSeen: new Date() }
     * })
     *
     * @example
     * // Error handling
     * try {
     *   client.sendTo('important', { data: 'critical' })
     * } catch (err) {
     *   console.error('Failed to send to client:', err)
     * }
     */
    sendTo(type, data) {
      if (clientInfo.send) {
        try {
          clientInfo.send(false, type, data, false);
        } catch (e) {
          /* istanbul ignore next 4 - send error during disconnect race condition */
          console.error(
            `📢 sendTo failed for ${clientInfo.clientId}:`,
            e.message,
          );
        }
      }
    },
  };
}

/**
 * Read-only proxy for the clients Map
 *
 * This proxy wraps the internal _clients Map to prevent external modification.
 * All read operations (get, has, keys, values, entries, forEach, size) work
 * normally, but write operations (set, delete, clear) throw errors.
 *
 * This ensures that only internal api-ape code can manage the client collection
 * while still allowing controllers and other code to query it.
 *
 * @type {Map<string, ClientWrapper>}
 *
 * @property {number} size - Number of connected clients
 *
 * @example
 * // Allowed operations
 * clients.get('clientId')           // ✓ Get a specific client
 * clients.has('clientId')           // ✓ Check if client exists
 * clients.size                      // ✓ Get count
 * clients.keys()                    // ✓ Iterate client IDs
 * clients.values()                  // ✓ Iterate client wrappers
 * clients.entries()                 // ✓ Iterate [id, wrapper] pairs
 * clients.forEach((c, id) => ...)   // ✓ For-each iteration
 * for (const c of clients.values()) // ✓ For-of iteration
 *
 * @example
 * // Blocked operations (throw errors)
 * clients.set('id', wrapper)        // ✗ Error: not allowed
 * clients.delete('id')              // ✗ Error: not allowed
 * clients.clear()                   // ✗ Error: not allowed
 */
const clients = new Proxy(_clients, {
  /**
   * Proxy get trap - intercepts property access
   *
   * @param {Map} target - The underlying _clients Map
   * @param {string|symbol} prop - Property being accessed
   * @returns {any} The property value or bound method
   * @private
   */
  get(target, prop) {
    // Prevent mutation methods by returning error-throwing functions
    if (prop === "set" || prop === "delete" || prop === "clear") {
      return () => {
        throw new Error(
          `ape.clients.${prop}() is not allowed. Clients are managed internally by api-ape.`,
        );
      };
    }

    // Allow size property directly
    if (prop === "size") {
      return target.size;
    }

    // Bind methods to target so they work correctly
    const value = target[prop];
    if (typeof value === "function") {
      return value.bind(target);
    }

    /* istanbul ignore next - accessing non-function Map properties not used in practice */
    return value;
  },
});

/**
 * Add a client to the connected clients map
 *
 * Called internally by wiring.js (WebSocket) and longPolling.js (HTTP streaming)
 * when a new client connection is established. Creates a ClientWrapper and
 * stores it in the internal map.
 *
 * **Internal use only** - external code should not call this function.
 *
 * @param {ClientInfo} clientInfo - Client information object
 * @param {string} clientInfo.clientId - Unique client identifier
 * @param {string|null} clientInfo.sessionId - Session ID from cookies
 * @param {Object} [clientInfo.agent] - Parsed user-agent
 * @param {Object} [clientInfo.embed] - Custom embedded values
 * @param {Function|null} clientInfo.send - Send function (may be null initially)
 * @returns {void}
 * @private
 *
 * @example
 * // Called internally from wiring.js
 * addClient({
 *   clientId: 'K7M3NP2Q',
 *   sessionId: 'sess_abc123',
 *   agent: parseUserAgent(req.headers['user-agent']),
 *   send: null,  // Set later once connection is fully established
 *   embed: null  // Set later from onConnect result
 * })
 */
function addClient(clientInfo) {
  const wrapper = createClientWrapper(clientInfo);
  _clients.set(clientInfo.clientId, wrapper);

  // Store reference to raw info so we can update embed later if needed
  wrapper._raw = clientInfo;

  console.log(
    `🟢 Client added: ${clientInfo.clientId} (total: ${_clients.size})`,
  );
}

/**
 * Remove a client from the connected clients map
 *
 * Called internally when a WebSocket closes or HTTP streaming connection ends.
 * Removes the client from the internal map and logs the disconnection.
 *
 * **Internal use only** - external code should not call this function.
 *
 * @param {string|{clientId: string}} clientIdOrInfo - Either a clientId string
 *        or an object with a clientId property
 * @returns {void}
 * @private
 *
 * @example
 * // Called with string
 * removeClient('K7M3NP2Q')
 *
 * // Called with object
 * removeClient({ clientId: 'K7M3NP2Q' })
 */
function removeClient(clientIdOrInfo) {
  const clientId =
    typeof clientIdOrInfo === "string"
      ? clientIdOrInfo
      : clientIdOrInfo.clientId;

  if (_clients.has(clientId)) {
    _clients.delete(clientId);
    console.log(`🔴 Client removed: ${clientId} (total: ${_clients.size})`);
  } else {
    console.log(
      `⚠️ Client not found for removal: ${clientId} (total: ${_clients.size})`,
    );
  }
}

/**
 * Update a client's embed values after onConnect resolves
 *
 * The embed values are set asynchronously after the onConnect handler
 * completes. This function updates the stored embed so it's accessible
 * via the client wrapper.
 *
 * **Internal use only** - called from wiring.js after onConnect resolves.
 *
 * @param {string} clientId - The client's unique identifier
 * @param {Object} embed - The embed values from onConnect
 * @returns {void}
 * @private
 *
 * @example
 * // Called internally after onConnect resolves
 * updateClientEmbed('K7M3NP2Q', { userId: 42, role: 'admin' })
 */
function updateClientEmbed(clientId, embed) {
  const wrapper = _clients.get(clientId);
  if (wrapper && wrapper._raw) {
    wrapper._raw.embed = embed;
  }
}

/**
 * Update a client's send function after it's ready
 *
 * The send function may not be available immediately when the client
 * is added (e.g., waiting for handshake completion). This function
 * sets it once the connection is fully established.
 *
 * **Internal use only** - called from wiring.js after connection is ready.
 *
 * @param {string} clientId - The client's unique identifier
 * @param {Function} send - The send function for this client
 * @returns {void}
 * @private
 *
 * @example
 * // Called internally when send function is ready
 * updateClientSend('K7M3NP2Q', sendHandler)
 */
function updateClientSend(clientId, send) {
  const wrapper = _clients.get(clientId);
  if (wrapper && wrapper._raw) {
    wrapper._raw.send = send;
  }
}

/**
 * Broadcast a message to all connected clients
 *
 * Sends a typed message to every connected client. Optionally excludes
 * a specific client (useful for not echoing messages back to the sender).
 *
 * ## Performance Considerations
 *
 * Broadcasting iterates over all connected clients synchronously.
 * For very large numbers of clients (10,000+), consider:
 * - Using a message queue for high-frequency broadcasts
 * - Implementing pub/sub with Redis for horizontal scaling
 *
 * ## Error Handling
 *
 * If sending to a specific client fails, the error is logged but
 * the broadcast continues to other clients. This prevents one
 * failing connection from blocking messages to everyone else.
 *
 * @param {string} type - Message type identifier
 * @param {any} data - Data payload to send (will be serialized with JSS)
 * @param {string} [excludeClientId] - Optional clientId to exclude from broadcast
 * @returns {void}
 *
 * @example <caption>Broadcast to everyone</caption>
 * broadcast('server-announcement', {
 *   title: 'Maintenance',
 *   message: 'Server will restart in 5 minutes'
 * })
 *
 * @example <caption>Chat message (exclude sender)</caption>
 * // Inside a controller handler
 * module.exports = function(data) {
 *   // this.clientId is the sender
 *   broadcast('chat', {
 *     user: this.embed.username,
 *     message: data.text,
 *     timestamp: new Date()
 *   }, this.clientId)  // Don't send back to sender
 *
 *   return { success: true }
 * }
 *
 * @example <caption>Targeted broadcast with filtering</caption>
 * // Broadcast only to admin users
 * for (const client of clients.values()) {
 *   if (client.embed?.role === 'admin') {
 *     client.sendTo('admin-alert', { severity: 'high', message: '...' })
 *   }
 * }
 *
 * @example <caption>With logging</caption>
 * const count = clients.size
 * broadcast('update', { version: '2.0' })
 * console.log(`Broadcasted update to ${count} clients`)
 */
function broadcast(type, data, excludeClientId) {
  console.log(
    `📢 Broadcasting "${type}" to ${_clients.size} clients`,
    excludeClientId ? `(excluding ${excludeClientId})` : "",
  );

  _clients.forEach((wrapper, clientId) => {
    if (excludeClientId && clientId === excludeClientId) {
      return; // Skip excluded client
    }
    wrapper.sendTo(type, data);
  });
}

module.exports = {
  /**
   * Read-only Map of connected clients
   *
   * Use this to query connected clients, send direct messages,
   * or implement custom routing logic.
   *
   * @type {Map<string, ClientWrapper>}
   */
  clients,

  /**
   * Broadcast a message to all (or most) connected clients
   *
   * @type {function(string, any, string=): void}
   */
  broadcast,

  /**
   * Internal: Add a client to the map
   * @private
   */
  addClient,

  /**
   * Internal: Remove a client from the map
   * @private
   */
  removeClient,

  /**
   * Internal: Update a client's embed values
   * @private
   */
  updateClientEmbed,

  /**
   * Internal: Update a client's send function
   * @private
   */
  updateClientSend,
};
