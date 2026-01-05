/**
 * Broadcast utilities for api-ape
 * Tracks connected clients and provides broadcast functions
 */

// Track all connected clients for broadcast
const connectedClients = new Set()

/**
 * Add a client to the connected set
 */
function addClient(clientInfo) {
    connectedClients.add(clientInfo)
    console.log(`🟢 Client added: ${clientInfo.clientId} (total: ${connectedClients.size})`)
}

/**
 * Remove a client from the connected set
 * Accepts either the client object or { clientId } for lookup
 */
function removeClient(clientInfo) {
    const sizeBefore = connectedClients.size
    // If exact reference found, delete it
    if (connectedClients.has(clientInfo)) {
        connectedClients.delete(clientInfo)
        console.log(`🔴 Client removed (ref): ${clientInfo.clientId} (total: ${connectedClients.size})`)
        return
    }
    // Otherwise search by clientId (needed for long polling cleanup)
    for (const client of connectedClients) {
        if (client.clientId === clientInfo.clientId) {
            connectedClients.delete(client)
            console.log(`🔴 Client removed (lookup): ${clientInfo.clientId} (total: ${connectedClients.size})`)
            return
        }
    }
    console.log(`⚠️ Client not found for removal: ${clientInfo.clientId} (total: ${connectedClients.size})`)
}

/**
 * Broadcast to all connected clients
 * @param {string} type - Message type
 * @param {any} data - Data to send
 * @param {string} [excludeClientId] - Optional clientId to exclude (e.g., sender)
 */
function broadcast(type, data, excludeClientId) {
    console.log(`📢 Broadcasting "${type}" to ${connectedClients.size} clients`, excludeClientId ? `(excluding ${excludeClientId})` : '')
    connectedClients.forEach(client => {
        if (excludeClientId && client.clientId === excludeClientId) {
            return // Skip excluded client
        }
        try {
            client.send(false, type, data, false)
        } catch (e) {
            console.error(`📢 Broadcast failed to ${client.clientId}:`, e.message)
        }
    })
}

/**
 * Get count of online clients
 */
function online() {
    return connectedClients.size
}

/**
 * Get all connected client clientIds
 */
function getClients() {
    return Array.from(connectedClients).map(c => c.clientId)
}

module.exports = {
    addClient,
    removeClient,
    broadcast,
    online,
    getClients
}
