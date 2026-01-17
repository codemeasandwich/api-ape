/**
 * @fileoverview Client Tracking for api-ape Server
 *
 * Manages connected WebSocket clients with a read-only proxy for external access.
 *
 * @module server/lib/broadcast/clients
 * @see {@link module:server/lib/broadcast} for the main broadcast module
 */

const createSendProxy = require("./sendProxy");

/**
 * Internal Map of connected clients
 * @type {Map<string, ClientWrapper>}
 * @private
 */
const _clients = new Map();

/**
 * Create a ClientWrapper that exposes client info and send function
 *
 * @param {Object} clientInfo - Raw client info from wiring/longPolling
 * @returns {Object} Public client interface
 * @private
 */
function createClientWrapper(clientInfo) {
  return {
    get clientId() {
      return clientInfo.clientId;
    },
    get sessionId() {
      return clientInfo.sessionId || null;
    },
    get embed() {
      return clientInfo.embed || {};
    },
    get agent() {
      return clientInfo.agent || {};
    },
    /**
     * Get current auth state for this client
     * @returns {Object|null} Auth state or null if not tracked
     */
    get authState() {
      if (clientInfo.socketAuth) {
        return clientInfo.socketAuth.getState();
      }
      return null;
    },
    /**
     * Check if client is authenticated
     * @returns {boolean} Whether client is authenticated
     */
    get isAuthenticated() {
      if (clientInfo.socketAuth) {
        return clientInfo.socketAuth.isAuthenticated();
      }
      return false;
    },
    /**
     * Get auth tier for this client
     * @returns {number} Auth tier (0-3)
     */
    get authTier() {
      if (clientInfo.socketAuth) {
        return clientInfo.socketAuth.getTier();
      }
      return 0;
    },
    /**
     * Send a message to this client
     *
     * Supports both direct and chained syntax:
     * - client.send('news/banking', data)
     * - client.send.news.banking(data)
     *
     * @type {Function & Proxy}
     */
    send: createSendProxy((type, data) => {
      if (clientInfo.send) {
        try {
          clientInfo.send(false, type, data, false);
        } catch (e) {
          /* istanbul ignore next */
          console.error(
            `📢 send failed for ${clientInfo.clientId}:`,
            e.message,
          );
        }
      }
    }),
  };
}

/**
 * Read-only proxy for the clients Map
 *
 * Allows read operations but blocks modifications.
 * @type {Map<string, ClientWrapper>}
 */
const clients = new Proxy(_clients, {
  /**
   * Proxy get handler - intercepts property access
   * @param {Map} target - The underlying clients Map
   * @param {string|symbol} prop - Property being accessed
   * @returns {any} The property value or bound method
   */
  get(target, prop) {
    if (prop === "set" || prop === "delete" || prop === "clear") {
      return () => {
        throw new Error(
          `ape.clients.${prop}() is not allowed. Clients are managed internally by api-ape.`,
        );
      };
    }
    if (prop === "size") {
      return target.size;
    }
    const value = target[prop];
    if (typeof value === "function") {
      return value.bind(target);
    }
    /* istanbul ignore next */
    return value;
  },
});

/**
 * Add a client to the connected clients map
 *
 * @param {Object} clientInfo - Client information object
 * @param {Function} [onAdd] - Optional callback after adding
 * @private
 */
function addClient(clientInfo, onAdd) {
  const wrapper = createClientWrapper(clientInfo);
  _clients.set(clientInfo.clientId, wrapper);
  wrapper._raw = clientInfo;
  console.log(
    `🟢 Client added: ${clientInfo.clientId} (total: ${_clients.size})`,
  );
  if (onAdd) onAdd(clientInfo.clientId);
}

/**
 * Remove a client from the connected clients map
 *
 * @param {string|Object} clientIdOrInfo - Client ID or info object with clientId
 * @param {Function} [onRemove] - Optional cleanup callback (receives clientId)
 * @private
 */
function removeClient(clientIdOrInfo, onRemove) {
  const clientId =
    typeof clientIdOrInfo === "string"
      ? clientIdOrInfo
      : clientIdOrInfo.clientId;

  if (_clients.has(clientId)) {
    _clients.delete(clientId);
    if (onRemove) onRemove(clientId);
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
 * @param {string} clientId - The client's unique identifier
 * @param {Object} embed - The embed values from onConnect
 * @private
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
 * @param {string} clientId - The client's unique identifier
 * @param {Function} send - The send function for this client
 * @private
 */
function updateClientSend(clientId, send) {
  const wrapper = _clients.get(clientId);
  if (wrapper && wrapper._raw) {
    wrapper._raw.send = send;
  }
}

/**
 * Update a client's auth state manager
 *
 * @param {string} clientId - The client's unique identifier
 * @param {Object} socketAuth - Socket auth manager instance
 * @private
 */
function updateClientAuth(clientId, socketAuth) {
  const wrapper = _clients.get(clientId);
  if (wrapper && wrapper._raw) {
    wrapper._raw.socketAuth = socketAuth;
  }
}

module.exports = {
  clients,
  _clients,
  addClient,
  removeClient,
  updateClientEmbed,
  updateClientSend,
  updateClientAuth,
};
