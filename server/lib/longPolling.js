/**
 * Long polling handler - HTTP fallback for WebSocket
 * @module server/lib/longPolling
 */

const { createGetHandler, ensureClientId } = require('./longPolling/getHandler')
const { createPostHandler, getClientId } = require('./longPolling/postHandler')

const streamClients = new Map()

function createLongPollingHandler(controllers, onConnect, fileTransfer) {
    const handleStreamGet = createGetHandler(streamClients, onConnect)
    const handleStreamPost = createPostHandler(streamClients)

    return {
        handleStreamGet,
        handleStreamPost,
        getStreamClients: () => streamClients
    }
}

module.exports = { createLongPollingHandler, getClientId, ensureClientId }
