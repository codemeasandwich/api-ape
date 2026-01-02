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
}

/**
 * Remove a client from the connected set
 */
function removeClient(clientInfo) {
    connectedClients.delete(clientInfo)
}

/**
 * Broadcast to all connected clients
 * @param {string} type - Message type
 * @param {any} data - Data to send
 * @param {string} [excludeHostId] - Optional hostId to exclude (e.g., sender)
 */
function broadcast(type, data, excludeHostId) {
    console.log(`📢 Broadcasting "${type}" to ${connectedClients.size} clients`, excludeHostId ? `(excluding ${excludeHostId})` : '')
    connectedClients.forEach(client => {
        if (excludeHostId && client.hostId === excludeHostId) {
            return // Skip excluded client
        }
        try {
            client.send(false, type, data, false)
        } catch (e) {
            console.error(`📢 Broadcast failed to ${client.hostId}:`, e.message)
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
 * Get all connected client hostIds
 */
function getClients() {
    return Array.from(connectedClients).map(c => c.hostId)
}

module.exports = {
    addClient,
    removeClient,
    broadcast,
    online,
    getClients
}
