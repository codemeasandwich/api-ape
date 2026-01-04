const loader = require('./loader')
const wiring = require('./wiring')
const { WebSocketServer } = require('ws')
const path = require('path')
const fs = require('fs')
const { getFileTransferManager } = require('./fileTransfer')
const { createLongPollingHandler } = require('./longPolling')
const { parse: parseUrl } = require('url')

let created = false

/**
 * Parse URL path parameters like /api/ape/data/:hash
 * Returns null if pattern doesn't match, or object with params if it does
 */
function matchRoute(pathname, pattern) {
    const patternParts = pattern.split('/')
    const pathParts = pathname.split('/')

    if (patternParts.length !== pathParts.length) {
        return null
    }

    const params = {}
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = pathParts[i]
        } else if (patternParts[i] !== pathParts[i]) {
            return null
        }
    }
    return params
}

/**
 * Send JSON response
 */
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
}

/**
 * Get cookie value from request
 */
function getCookie(req, name) {
    const cookies = req.headers.cookie
    if (!cookies) return null
    const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    return match ? match[1] : null
}

/**
 * Check if request is from localhost
 */
function isLocalhost(req) {
    const host = req.headers.host?.split(':')[0] || ''
    return ['localhost', '127.0.0.1', '[::1]'].includes(host)
}

/**
 * Check if connection is secure (HTTPS)
 */
function isSecure(req) {
    return req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https'
}

module.exports = function (server, { where, onConnent, fileTransferOptions }) {

    if (created) {
        throw new Error("Api-Ape already started")
    }
    created = true

    const controllers = loader(where)
    const fileTransfer = getFileTransferManager(fileTransferOptions)

    // Create WebSocket server attached to the HTTP server
    const wss = new WebSocketServer({ noServer: true })

    // Handle WebSocket connections
    const wsPath = `/${where}/ape`
    const pollPath = `/${where}/ape/poll`
    const wiringHandler = wiring(controllers, onConnent, fileTransfer)

    // Create long polling handler for WebSocket fallback
    const { handleStreamGet, handleStreamPost } = createLongPollingHandler(controllers, onConnent, fileTransfer)

    wss.on('connection', wiringHandler)

    // Handle HTTP upgrade requests for WebSocket
    server.on('upgrade', (req, socket, head) => {
        const { pathname } = parseUrl(req.url)

        if (pathname === wsPath) {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req)
            })
        } else {
            socket.destroy()
        }
    })

    // Store original request listeners to chain after api-ape handlers
    const originalListeners = server.listeners('request').slice()
    server.removeAllListeners('request')

    // Handle HTTP requests for api-ape routes
    server.on('request', (req, res) => {
        const { pathname } = parseUrl(req.url)

        // Serve bundled client at /api/ape.js (or /{where}/ape.js)
        if (pathname === `/${where}/ape.js`) {
            const filePath = path.join(__dirname, '../../dist/ape.js')
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    sendJson(res, 500, { error: 'Failed to read client bundle' })
                    return
                }
                res.writeHead(200, { 'Content-Type': 'application/javascript' })
                res.end(data)
            })
            return
        }

        // Long polling endpoints - GET /api/ape/poll (streaming receive)
        if (pathname === pollPath && req.method === 'GET') {
            handleStreamGet(req, res)
            return
        }

        // Long polling endpoints - POST /api/ape/poll (send messages)
        if (pathname === pollPath && req.method === 'POST') {
            handleStreamPost(req, res, controllers)
            return
        }

        // File download endpoint - GET /api/ape/data/:hash
        const downloadMatch = matchRoute(pathname, `/${where}/ape/data/:hash`)
        if (req.method === 'GET' && downloadMatch) {
            const { hash } = downloadMatch
            const hostId = getCookie(req, 'apeHostId') || req.headers['x-ape-host-id']

            if (!hostId) {
                return sendJson(res, 401, { error: 'Missing session identifier' })
            }

            if (!isLocalhost(req) && !isSecure(req)) {
                return sendJson(res, 403, { error: 'HTTPS required for file transfers' })
            }

            const result = fileTransfer.getDownload(hash, hostId)

            if (!result) {
                return sendJson(res, 404, { error: 'Download not found or unauthorized' })
            }

            res.writeHead(200, {
                'Content-Type': result.contentType,
                'Content-Length': result.data.length || result.data.byteLength
            })
            res.end(result.data)
            return
        }

        // File upload endpoint - PUT /api/ape/data/:queryId/:pathHash
        const uploadMatch = matchRoute(pathname, `/${where}/ape/data/:queryId/:pathHash`)
        if (req.method === 'PUT' && uploadMatch) {
            const { queryId, pathHash } = uploadMatch
            const hostId = getCookie(req, 'apeHostId') || req.headers['x-ape-host-id']

            if (!hostId) {
                return sendJson(res, 401, { error: 'Missing session identifier' })
            }

            if (!isLocalhost(req) && !isSecure(req)) {
                return sendJson(res, 403, { error: 'HTTPS required for file transfers' })
            }

            const chunks = []
            req.on('data', chunk => chunks.push(chunk))
            req.on('end', () => {
                const data = Buffer.concat(chunks)
                const success = fileTransfer.receiveUpload(queryId, pathHash, data, hostId)

                if (success) {
                    sendJson(res, 200, { success: true })
                } else {
                    sendJson(res, 404, { error: 'Upload not expected or unauthorized' })
                }
            })
            req.on('error', (err) => {
                sendJson(res, 500, { error: err.message })
            })
            return
        }

        // Not an api-ape route - pass to original handlers
        for (const listener of originalListeners) {
            listener.call(server, req, res)
        }
    })
}