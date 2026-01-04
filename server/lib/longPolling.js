const { addClient, removeClient, broadcast } = require('./broadcast')
const makeid = require('../utils/genId')
const jss = require('../../utils/jss')

// Active streaming connections: hostId -> { res, messageQueue, heartbeatTimer }
const streamClients = new Map()

// Pending message handlers for POST requests: queryId -> { resolve, reject, timer }
const pendingRequests = new Map()

/**
 * Set apeHostId cookie if not present
 */
function ensureHostId(req, res) {
    const cookies = req.headers.cookie || ''
    const match = cookies.match(/(?:^|;\s*)apeHostId=([^;]*)/)

    if (match) {
        return match[1]
    }

    // Generate new hostId and set cookie
    const hostId = makeid(20)
    res.setHeader('Set-Cookie', `apeHostId=${hostId}; Path=/; HttpOnly; SameSite=Strict`)
    return hostId
}

/**
 * Get hostId from cookie
 */
function getHostId(req) {
    const cookies = req.headers.cookie || ''
    const match = cookies.match(/(?:^|;\s*)apeHostId=([^;]*)/)
    return match ? match[1] : null
}

/**
 * Send JSON response helper
 */
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
}

/**
 * Create long polling handler
 */
function createLongPollingHandler(controllers, onConnent, fileTransfer) {

    /**
     * Handle GET /api/ape/poll - Streaming receive
     * Keeps connection open and writes JSON messages as they arrive
     */
    function handleStreamGet(req, res) {
        const hostId = ensureHostId(req, res)

        // Set up streaming response headers
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' // Disable nginx buffering
        })

        // Create message queue for this client
        const clientState = {
            res,
            messageQueue: [],
            heartbeatTimer: null,
            isActive: true
        }

        // Send function for this streaming client
        const send = (type, data, err) => {
            if (!clientState.isActive) return

            const message = jss.stringify({ type, data, err: err || undefined })
            try {
                res.write(message)
            } catch (e) {
                cleanup()
            }
        }
        send.toString = () => hostId

        // Clean up on close
        const cleanup = () => {
            if (!clientState.isActive) return
            clientState.isActive = false

            if (clientState.heartbeatTimer) {
                clearInterval(clientState.heartbeatTimer)
            }

            streamClients.delete(hostId)
            removeClient({ hostId })

            // Notify disconnect handler if registered
            if (clientState.onDisconnect) {
                clientState.onDisconnect()
            }
        }

        req.on('close', cleanup)
        req.on('error', cleanup)
        res.on('error', cleanup)

        // Heartbeat to keep connection alive (every 20s)
        clientState.heartbeatTimer = setInterval(() => {
            if (!clientState.isActive) return
            try {
                // Send heartbeat as empty comment (client ignores)
                res.write('{"type":"__heartbeat__"}')
            } catch (e) {
                cleanup()
            }
        }, 20000)

        // Register client for broadcasts
        const clientInfo = { hostId, send }
        addClient(clientInfo)
        streamClients.set(hostId, clientState)

        // Call onConnent hook if provided
        if (onConnent) {
            Promise.resolve(onConnent(null, req, send))
                .then(handlers => {
                    if (handlers) {
                        if (handlers.onDisconnent) {
                            clientState.onDisconnect = handlers.onDisconnent
                        }
                        if (handlers.embed) {
                            clientState.embed = handlers.embed
                        }
                    }
                })
                .catch(err => {
                    console.error('onConnent error:', err)
                })
        }

        // Close after 25 seconds (before typical proxy timeout)
        // Client will immediately reconnect
        setTimeout(() => {
            cleanup()
            try {
                res.end()
            } catch (e) { }
        }, 25000)
    }

    /**
     * Handle POST /api/ape/poll - Send messages
     * Process message through controllers, return response
     */
    function handleStreamPost(req, res, controllers) {
        const hostId = getHostId(req)

        if (!hostId) {
            return sendJson(res, 401, { error: 'Missing session. GET /api/ape/poll first.' })
        }

        // Collect body
        const chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', async () => {
            try {
                const body = Buffer.concat(chunks).toString('utf8')
                const { type: rawType, data, createdAt } = jss.parse(body)

                // Normalize type
                const type = rawType.replace(/^\//, '').toLowerCase()

                // Find controller
                const controller = controllers[type]
                if (!controller) {
                    return sendJson(res, 404, { error: `Controller "${type}" not found` })
                }

                // Get client state for embed values
                const clientState = streamClients.get(hostId)
                const embedValues = clientState?.embed || {}

                // Extract sessionId from cookies (set by outer framework)
                const sessionIdMatch = (req.headers.cookie || '').match(/(?:^|;\s*)sessionId=([^;]*)/)
                const sessionId = sessionIdMatch ? sessionIdMatch[1] : null

                // Build controller context
                const context = {
                    ...embedValues,
                    hostId,
                    sessionId,  // Session ID from cookie (set by outer framework)
                    req,
                    broadcast: (t, d) => broadcast(t, d),
                    broadcastOthers: (t, d) => broadcast(t, d, hostId),
                    online: () => streamClients.size,
                    getClients: () => Array.from(streamClients.keys())
                }

                // Execute controller
                const result = await controller.call(context, data)

                // Send response
                const responsePayload = { data: result }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(jss.stringify(responsePayload))

            } catch (err) {
                const errorMessage = err.message || String(err)
                sendJson(res, 500, { error: errorMessage })
            }
        })

        req.on('error', (err) => {
            sendJson(res, 500, { error: err.message })
        })
    }

    return {
        handleStreamGet,
        handleStreamPost,
        getStreamClients: () => streamClients
    }
}

module.exports = { createLongPollingHandler, getHostId, ensureHostId }
