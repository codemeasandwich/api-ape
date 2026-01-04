/**
 * api-ape onConnect handler
 * Creates the handlers object returned from onConnent
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

function onConnent(socket, req, send) {
    const clientID = send.toString()
    console.log(`🦍 Client connected: ${clientID}`)

    const embed = createEmbed(clientID, req.headers?.['x-session-id'])

    // Send init message with history and user count
    console.log(`📤 Sending init to ${clientID}, users: ${ape.online()}`)
    try {
        send('init', {
            history: getHistory(),
            users: ape.online()
        })
        console.log(`✅ Init sent to ${clientID}`)
    } catch (e) {
        console.error(`❌ Failed to send init:`, e)
    }

    // Broadcast updated user count to all clients
    ape.broadcast('users', { count: ape.online() })

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
                ape.broadcast('users', { count: ape.online() })
            }, 50)
        }
    }
}

module.exports = { onConnent }
