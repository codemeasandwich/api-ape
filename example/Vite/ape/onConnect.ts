/**
 * api-ape onConnect handler
 * Creates the handlers object returned from onConnect
 */

const { ape } = require('api-ape')

// Get message history from the message controller
function getHistory() {
    try {
        const messageController = require('../api/message')
        return messageController.getHistory ? messageController.getHistory() : []
    } catch (e) {
        return []
    }
}

export function onConnect(socket: any, req: any, send: any) {
    const clientID = send.toString()
    console.log(`🦍 Client connected: ${clientID}`)

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
        onDisconnect: () => {
            console.info(`👋 Disconnected [${clientID}]`)
            // Broadcast updated user count after disconnect
            // Use setTimeout to ensure client is removed first
            setTimeout(() => {
                ape.broadcast('users', { count: ape.clients.size })
            }, 50)
        }
    }
}

export default onConnect
