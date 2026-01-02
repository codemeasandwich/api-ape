/**
 * api-ape onConnect handler
 * Creates the handlers object returned from onConnent
 */

const { createEmbed } = require('./embed')
const { onReceive } = require('./onReceive')
const { onSend } = require('./onSend')
const { onError } = require('./onError')
const { broadcast, online } = require('api-ape/server/lib/broadcast')

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

    // Send init message with history and user count after a tiny delay
    // (to ensure client is ready to receive)
    setTimeout(() => {
        console.log(`📤 Sending init to ${clientID}, users: ${online()}`)
        try {
            send('init', {
                history: getHistory(),
                users: online()
            })
            console.log(`✅ Init sent to ${clientID}`)
        } catch (e) {
            console.error(`❌ Failed to send init:`, e)
        }

        // Broadcast updated user count to all clients
        broadcast('users', { count: online() })
    }, 100)

    return {
        embed,

        onReceive: (queryId, payload, type) =>
            onReceive(clientID, queryId, payload, type),

        onSend: (payload, type) =>
            onSend(clientID, payload, type),

        onError: (errStr) =>
            onError(clientID, errStr),

        onDisconnent: () => {
            console.info(`👋 Disconnected [${clientID}]`)
            // Broadcast updated user count after disconnect
            // Use setTimeout to ensure client is removed first
            setTimeout(() => {
                broadcast('users', { count: online() })
            }, 50)
        }
    }
}

module.exports = { onConnect }
