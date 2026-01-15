/**
 * @fileoverview Client Tracking for api-ape Server
 *
 * Manages connected WebSocket clients with a read-only proxy for external access.
 *
 * @module server/lib/broadcast/clients
 * @see {@link module:server/lib/broadcast} for the main broadcast module
 */

/**
 * Internal Map of connected clients
 * @type {Map<string, ClientWrapper>}
 * @private
 */
const _clients = new Map();

/**
 * Create a ClientWrapper that exposes client info and sendTo function
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
    sendTo(type, data) {
      if (clientInfo.send) {
        try {
          clientInfo.send(false, type, data, false);
        } catch (e) {
          /* istanbul ignore next */
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
 * Allows read operations but blocks modifications.
 * @type {Map<string, ClientWrapper>}
 */
const clients = new Proxy(_clients, {
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
 * @param {string|{clientId: string}} clientIdOrInfo - Client ID or info object
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

module.exports = {
  clients,
  _clients,
  addClient,
  removeClient,
  updateClientEmbed,
  updateClientSend,
};
