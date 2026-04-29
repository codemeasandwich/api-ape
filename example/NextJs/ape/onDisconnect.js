/**
 * api-ape onDisconnect handler
 */

const { ape } = require('api-ape')

function onDisconnect(clientID, unsubscribe) {
    console.info(`Disconnected [${clientID}]`)
    unsubscribe()
    ape.publish.users({ count: ape.clients.size })
}

module.exports = { onDisconnect }
