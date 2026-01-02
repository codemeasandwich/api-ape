/**
 * api-ape onDisconnect handler
 */

const { broadcast, online } = require('./logic/chat')

function onDisconnect(clientID, unsubscribe) {
    console.info(`👋 Disconnected [${clientID}]`)
    unsubscribe()
    broadcast('users', { count: online() })
}

module.exports = { onDisconnect }
