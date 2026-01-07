/**
 * api-ape onConnect handler
 * Creates the handlers object returned from onConnect
 */

const { createEmbed } = require('./embed')
const { onReceive } = require('./onReceive')
const { onSend } = require('./onSend')
const { onError } = require('./onError')
const ape = require('api-ape')

// Get message history from the message controller
function getHistory() {
    try {
        const messageController = require('../api/message')
        return messageController.getHistory ? messageController.getHistory() : []
    } catch (e) {
        return []
    }
}

function onConnect(socket, req, send) {
    const clientID = send.toString()
    console.log(`🦍 Client connected: ${clientID}`)

    const embed = createEmbed(clientID, req.headers?.['x-session-id'])

    // Send init message with history and user count
    console.log(`📤 Sending init to ${clientID}, users: ${ape.clients.size}`)
    try {
        send('init', {
            history: getHistory(),
            users: ape.clients.size
        })
        console.log(`✅ Init sent to ${clientID}`)
    } catch (e) {
        console.error(`❌ Failed to send init:`, e)
    }

    // Broadcast updated user count to all clients
    ape.broadcast('users', { count: ape.clients.size })

    return {
        embed,

        onReceive: (queryId, payload, type) =>
            onReceive(clientID, queryId, payload, type),

        onSend: (payload, type) =>
            onSend(clientID, payload, type),

        onError: (errStr) =>
            onError(clientID, errStr),

        onDisconnect: () => {
            console.info(`👋 Disconnected [${clientID}]`)
            // Client is already removed from broadcast list, safe to broadcast new count
            ape.broadcast('users', { count: ape.clients.size })
        }
    }
}

module.exports = { onConnect }
