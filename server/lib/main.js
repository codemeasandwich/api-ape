const loader = require('./loader')
const wiring = require('./wiring')
const { getWebSocketProvider, isBun, isDeno, getRuntime } = require('./wsProvider')
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
 * Send JSON response (Node.js style)
 */
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
}

/**
 * Get cookie value from request headers
 */
function getCookie(headers, name) {
    const cookies = typeof headers.get === 'function'
        ? headers.get('cookie')
        : headers.cookie
    if (!cookies) return null
    const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    return match ? match[1] : null
}

/**
 * Check if request is from localhost
 */
function isLocalhost(host) {
    const hostname = host?.split(':')[0] || ''
    return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

/**
 * Check if connection is secure (HTTPS)
 */
function isSecure(req) {
    if (typeof req.headers?.get === 'function') {
        return req.headers.get('x-forwarded-proto') === 'https'
    }
    return req.socket?.encrypted || req.headers?.['x-forwarded-proto'] === 'https'
}

/**
 * Create core api-ape handlers (shared between runtimes)
 */
function createApeCore({ where, onConnent, fileTransferOptions }) {
    const controllers = loader(where)
    const fileTransfer = getFileTransferManager(fileTransferOptions)
    const wiringHandler = wiring(controllers, onConnent, fileTransfer)
    const { handleStreamGet, handleStreamPost } = createLongPollingHandler(controllers, onConnent, fileTransfer)

    const wsPath = `/${where}/ape`
    const pollPath = `/${where}/ape/poll`
    const pingPath = `/${where}/ape/ping`
    const clientPath = `/${where}/ape.js`
    const clientMapPath = `/${where}/ape.js.map`
    const downloadPattern = `/${where}/ape/data/:hash`
    const uploadPattern = `/${where}/ape/data/:queryId/:pathHash`

    return {
        controllers,
        fileTransfer,
        wiringHandler,
        handleStreamGet,
        handleStreamPost,
        wsPath,
        pollPath,
        pingPath,
        clientPath,
        clientMapPath,
        downloadPattern,
        uploadPattern
    }
}

/**
 * Node.js / Express integration
 * Uses server.on('upgrade') and server.on('request')
 */
function initNodeServer(server, options) {
    const { WebSocketServer } = getWebSocketProvider()
    const core = createApeCore(options)
    const { where } = options

    const wss = new WebSocketServer({ noServer: true })
    wss.on('connection', core.wiringHandler)

    // Handle HTTP upgrade requests for WebSocket
    server.on('upgrade', (req, socket, head) => {
        const { pathname } = parseUrl(req.url)

        if (pathname === core.wsPath) {
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

        // Serve bundled client
        if (pathname === core.clientPath) {
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

        // Serve source map for debugging
        if (pathname === core.clientMapPath) {
            const filePath = path.join(__dirname, '../../dist/ape.js.map')
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    sendJson(res, 404, { error: 'Source map not found' })
                    return
                }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(data)
            })
            return
        }

        // Ping endpoint for captive portal detection
        if (pathname === core.pingPath && req.method === 'GET') {
            return sendJson(res, 200, { ok: true, ts: Date.now() })
        }

        // Long polling - GET
        if (pathname === core.pollPath && req.method === 'GET') {
            core.handleStreamGet(req, res)
            return
        }

        // Long polling - POST
        if (pathname === core.pollPath && req.method === 'POST') {
            core.handleStreamPost(req, res, core.controllers)
            return
        }

        // File download
        const downloadMatch = matchRoute(pathname, core.downloadPattern)
        if (req.method === 'GET' && downloadMatch) {
            const { hash } = downloadMatch
            const clientId = getCookie(req.headers, 'apeClientId') || req.headers['x-ape-client-id']

            if (!clientId) {
                return sendJson(res, 401, { error: 'Missing session identifier' })
            }

            if (!isLocalhost(req.headers.host) && !isSecure(req)) {
                return sendJson(res, 403, { error: 'HTTPS required for file transfers' })
            }

            const result = core.fileTransfer.getDownload(hash, clientId)

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

        // File upload
        const uploadMatch = matchRoute(pathname, core.uploadPattern)
        if (req.method === 'PUT' && uploadMatch) {
            const { queryId, pathHash } = uploadMatch
            const clientId = getCookie(req.headers, 'apeClientId') || req.headers['x-ape-client-id']

            if (!clientId) {
                return sendJson(res, 401, { error: 'Missing session identifier' })
            }

            if (!isLocalhost(req.headers.host) && !isSecure(req)) {
                return sendJson(res, 403, { error: 'HTTPS required for file transfers' })
            }

            const chunks = []
            req.on('data', chunk => chunks.push(chunk))
            req.on('end', () => {
                const data = Buffer.concat(chunks)
                const success = core.fileTransfer.receiveUpload(queryId, pathHash, data, clientId)

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

    return { wss, core }
}

/**
 * Bun integration
 * Returns fetch and websocket handlers to spread into Bun.serve()
 */
function initBunServer(options) {
    const { BunWebSocket } = require('./ws/adapters/bun')
    const core = createApeCore(options)
    const clients = new Map()

    /**
     * Fetch handler for Bun.serve()
     * Handles all api-ape routes, returns null for non-ape routes
     */
    function fetch(req, server) {
        const url = new URL(req.url)
        const pathname = url.pathname

        // WebSocket upgrade
        if (pathname === core.wsPath) {
            const upgrade = req.headers.get('upgrade')
            if (upgrade?.toLowerCase() === 'websocket') {
                const success = server.upgrade(req, { data: { req } })
                if (success) return undefined
                return new Response('WebSocket upgrade failed', { status: 500 })
            }
        }

        // Serve client bundle
        if (pathname === core.clientPath) {
            try {
                const filePath = path.join(__dirname, '../../dist/ape.js')
                const data = fs.readFileSync(filePath)
                return new Response(data, {
                    headers: { 'Content-Type': 'application/javascript' }
                })
            } catch {
                return new Response('Client bundle not found', { status: 500 })
            }
        }

        // Serve source map for debugging
        if (pathname === core.clientMapPath) {
            try {
                const filePath = path.join(__dirname, '../../dist/ape.js.map')
                const data = fs.readFileSync(filePath)
                return new Response(data, {
                    headers: { 'Content-Type': 'application/json' }
                })
            } catch {
                return new Response('Source map not found', { status: 404 })
            }
        }

        // Ping endpoint for captive portal detection
        if (pathname === core.pingPath && req.method === 'GET') {
            return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
                headers: { 'Content-Type': 'application/json' }
            })
        }

        // Not an api-ape route
        return null
    }

    /**
     * WebSocket handlers for Bun.serve()
     */
    const websocket = {
        open(ws) {
            const wrapper = new BunWebSocket(ws)
            clients.set(ws, wrapper)
            const { req } = ws.data || {}
            core.wiringHandler(wrapper, req)
        },

        message(ws, message) {
            const wrapper = clients.get(ws)
            if (wrapper) {
                wrapper._onMessage(message)
            }
        },

        close(ws, code, reason) {
            const wrapper = clients.get(ws)
            if (wrapper) {
                wrapper._onClose(code, reason)
                clients.delete(ws)
            }
        },

        error(ws, error) {
            const wrapper = clients.get(ws)
            if (wrapper) {
                wrapper._onError(error)
            }
        }
    }

    return { fetch, websocket, clients, core }
}

/**
 * Check if server is a Bun server (has reload method and Bun globals)
 */
function isBunServer(server) {
    return isBun() && typeof server?.reload === 'function'
}

/**
 * Initialize Bun server using server.reload() to hook in
 * This allows same signature: ape(server, { where: 'api' })
 */
function initBunServerWithReload(server, options) {
    const { BunWebSocket } = require('./ws/adapters/bun')
    const core = createApeCore(options)
    const clients = new Map()

    // Check if WebSocket support is enabled on Bun server
    // Bun requires websocket handlers to be defined at Bun.serve() creation
    const hasWebSocketSupport = typeof server.upgrade === 'function'

    if (!hasWebSocketSupport && options.transport !== 'longpolling') {
        throw new Error(`
🦍 api-ape: Bun WebSocket support not enabled!

To enable WebSocket support in Bun, add a 'websocket' property when creating your server:

    const server = Bun.serve({
        port: 3000,
        fetch(req) { ... },
        websocket: { message() {} }  // <-- Required for api-ape
    })

    ape(server, { where: 'api' })

If you only want HTTP long-polling (no WebSocket), pass:
    ape(server, { where: 'api', transport: 'longpolling' })
`)
    }

    // Store original fetch handler
    const originalFetch = server.fetch

    /**
     * Wrapped fetch handler that handles api-ape routes first
     */
    function wrappedFetch(req, server) {
        const url = new URL(req.url)
        const pathname = url.pathname

        // WebSocket upgrade
        if (pathname === core.wsPath) {
            const upgrade = req.headers.get('upgrade')
            if (upgrade?.toLowerCase() === 'websocket') {
                const success = server.upgrade(req, { data: { req } })
                if (success) return undefined
                return new Response('WebSocket upgrade failed', { status: 500 })
            }
        }

        // Serve client bundle
        if (pathname === core.clientPath) {
            try {
                const filePath = path.join(__dirname, '../../dist/ape.js')
                const data = fs.readFileSync(filePath)
                return new Response(data, {
                    headers: { 'Content-Type': 'application/javascript' }
                })
            } catch {
                return new Response('Client bundle not found', { status: 500 })
            }
        }

        // Serve source map for debugging
        if (pathname === core.clientMapPath) {
            try {
                const filePath = path.join(__dirname, '../../dist/ape.js.map')
                const data = fs.readFileSync(filePath)
                return new Response(data, {
                    headers: { 'Content-Type': 'application/json' }
                })
            } catch {
                return new Response('Source map not found', { status: 404 })
            }
        }

        // Ping endpoint for captive portal detection
        if (pathname === core.pingPath && req.method === 'GET') {
            return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
                headers: { 'Content-Type': 'application/json' }
            })
        }

        // Pass to original fetch handler
        if (originalFetch) {
            return originalFetch(req, server)
        }

        return new Response('Not Found', { status: 404 })
    }

    /**
     * WebSocket handlers
     */
    const websocket = {
        open(ws) {
            const wrapper = new BunWebSocket(ws)
            clients.set(ws, wrapper)
            const { req } = ws.data || {}
            core.wiringHandler(wrapper, req)
        },

        message(ws, message) {
            const wrapper = clients.get(ws)
            if (wrapper) {
                wrapper._onMessage(message)
            }
        },

        close(ws, code, reason) {
            const wrapper = clients.get(ws)
            if (wrapper) {
                wrapper._onClose(code, reason)
                clients.delete(ws)
            }
        },

        error(ws, error) {
            const wrapper = clients.get(ws)
            if (wrapper) {
                wrapper._onError(error)
            }
        }
    }

    // Use server.reload() to hook in our handlers
    server.reload({
        fetch: wrappedFetch,
        websocket
    })

    return { clients, core }
}

/**
 * Main api-ape entry point
 * Unified signature for all runtimes:
 *   ape(server, { where: 'api' })
 * 
 * Works with:
 * - Node.js http.Server
 * - Express server
 * - Bun.serve() server
 */
module.exports = function (server, options) {
    if (created) {
        throw new Error("Api-Ape already started")
    }
    created = true

    // Bun server - use server.reload() to hook in
    if (isBunServer(server)) {
        return initBunServerWithReload(server, options)
    }

    // Node.js / Express - server is an http.Server with .on() method
    if (server && typeof server.on === 'function') {
        return initNodeServer(server, options)
    }

    throw new Error('Unsupported server type. Expected http.Server (Node.js) or Bun.serve() server.')
}

// Export runtime detection utilities
module.exports.isBun = isBun
module.exports.isDeno = isDeno
module.exports.getRuntime = getRuntime