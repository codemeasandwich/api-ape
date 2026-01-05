/**
 * Client tracking and broadcast utilities for api-ape
 * Provides a Map of connected clients with sendTo functionality
 */

// Internal Map of connected clients: clientId -> ClientWrapper
const _clients = new Map()

/**
 * Create a ClientWrapper that exposes client info and sendTo function
 * @param {object} clientInfo - Raw client info from wiring/longPolling
 */
function createClientWrapper(clientInfo) {
    return {
        get clientId() { return clientInfo.clientId },
        get sessionId() { return clientInfo.sessionId || null },
        get embed() { return clientInfo.embed || {} },
        get agent() { return clientInfo.agent || {} },
        /**
         * Send a message to this specific client
         * @param {string} type - Message type
         * @param {any} data - Data to send
         */
        sendTo(type, data) {
            if (clientInfo.send) {
                try {
                    clientInfo.send(false, type, data, false)
                } catch (e) {
                    console.error(`📢 sendTo failed for ${clientInfo.clientId}:`, e.message)
                }
            }
        }
    }
}

/**
 * Read-only proxy for the clients Map
 * Allows: get, has, keys, values, entries, forEach, size, iteration
 * Prevents: set, delete, clear (throws error if attempted)
 */
const clients = new Proxy(_clients, {
    get(target, prop) {
        // Prevent mutation methods
        if (prop === 'set' || prop === 'delete' || prop === 'clear') {
            return () => {
                throw new Error(`ape.clients.${prop}() is not allowed. Clients are managed internally by api-ape.`)
            }
        }

        // Allow size property
        if (prop === 'size') {
            return target.size
        }

        // Bind methods to target
        const value = target[prop]
        if (typeof value === 'function') {
            return value.bind(target)
        }

        return value
    }
})

/**
 * Add a client to the connected map (internal use only)
 * @param {object} clientInfo - { clientId, sessionId, agent, embed, send }
 */
function addClient(clientInfo) {
    const wrapper = createClientWrapper(clientInfo)
    _clients.set(clientInfo.clientId, wrapper)

    // Store reference to raw info so we can update embed later if needed
    wrapper._raw = clientInfo

    console.log(`🟢 Client added: ${clientInfo.clientId} (total: ${_clients.size})`)
}

/**
 * Remove a client from the connected map (internal use only)
 * @param {string|object} clientIdOrInfo - clientId string or { clientId } object
 */
function removeClient(clientIdOrInfo) {
    const clientId = typeof clientIdOrInfo === 'string'
        ? clientIdOrInfo
        : clientIdOrInfo.clientId

    if (_clients.has(clientId)) {
        _clients.delete(clientId)
        console.log(`🔴 Client removed: ${clientId} (total: ${_clients.size})`)
    } else {
        console.log(`⚠️ Client not found for removal: ${clientId} (total: ${_clients.size})`)
    }
}

/**
 * Update a client's embed values after onConnect resolves (internal use only)
 * @param {string} clientId 
 * @param {object} embed 
 */
function updateClientEmbed(clientId, embed) {
    const wrapper = _clients.get(clientId)
    if (wrapper && wrapper._raw) {
        wrapper._raw.embed = embed
    }
}

/**
 * Update a client's send function after it's ready (internal use only)
 * @param {string} clientId 
 * @param {function} send 
 */
function updateClientSend(clientId, send) {
    const wrapper = _clients.get(clientId)
    if (wrapper && wrapper._raw) {
        wrapper._raw.send = send
    }
}

/**
 * Broadcast to all connected clients
 * @param {string} type - Message type
 * @param {any} data - Data to send
 * @param {string} [excludeClientId] - Optional clientId to exclude (e.g., sender)
 */
function broadcast(type, data, excludeClientId) {
    console.log(`📢 Broadcasting "${type}" to ${_clients.size} clients`, excludeClientId ? `(excluding ${excludeClientId})` : '')
    _clients.forEach((wrapper, clientId) => {
        if (excludeClientId && clientId === excludeClientId) {
            return // Skip excluded client
        }
        wrapper.sendTo(type, data)
    })
}

module.exports = {
    // Public: read-only clients Map
    clients,
    // Public: broadcast function
    broadcast,
    // Internal: client management (used by wiring.js and longPolling.js)
    addClient,
    removeClient,
    updateClientEmbed,
    updateClientSend
}
