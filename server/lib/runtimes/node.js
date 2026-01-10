/**
 * Node.js / Express integration for api-ape
 * @module server/lib/runtimes/node
 */

const { getWebSocketProvider } = require('../wsProvider')
const { parse: parseUrl } = require('url')
const { matchRoute, sendJson, getCookie, isLocalhost, isSecure, serveClientBundle, serveSourceMap } = require('../httpUtils')

function initNodeServer(server, options, core) {
    const { WebSocketServer } = getWebSocketProvider()

    const wss = new WebSocketServer({ noServer: true })
    wss.on('connection', core.wiringHandler)

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

    const originalListeners = server.listeners('request').slice()
    server.removeAllListeners('request')

    server.on('request', (req, res) => {
        const { pathname } = parseUrl(req.url)

        if (pathname === core.clientPath) {
            return serveClientBundle(core.clientPath, res)
        }

        if (pathname === core.clientMapPath) {
            return serveSourceMap(res)
        }

        if (pathname === core.pingPath && req.method === 'GET') {
            return sendJson(res, 200, { ok: true, ts: Date.now() })
        }

        if (pathname === core.pollPath && req.method === 'GET') {
            core.handleStreamGet(req, res)
            return
        }

        if (pathname === core.pollPath && req.method === 'POST') {
            core.handleStreamPost(req, res, core.controllers)
            return
        }

        const downloadMatch = matchRoute(pathname, core.downloadPattern)
        if (req.method === 'GET' && downloadMatch) {
            return handleDownload(req, res, downloadMatch.hash, core)
        }

        const uploadMatch = matchRoute(pathname, core.uploadPattern)
        if (req.method === 'PUT' && uploadMatch) {
            return handleUpload(req, res, uploadMatch, core)
        }

        for (const listener of originalListeners) {
            listener.call(server, req, res)
        }
    })

    return { wss, core }
}

function handleDownload(req, res, hash, core) {
    const streamingFile = core.fileTransfer.getStreamingFile(hash)
    if (streamingFile) {
        if (!isLocalhost(req.headers.host) && !isSecure(req)) {
            return sendJson(res, 403, { error: 'HTTPS required for file transfers' })
        }
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': streamingFile.data.length,
            'X-Ape-Complete': streamingFile.isComplete ? '1' : '0',
            'X-Ape-Total-Received': String(streamingFile.totalReceived)
        })
        res.end(streamingFile.data)
        return
    }

    const clientId = getCookie(req.headers, 'apeClientId') || req.headers['x-ape-client-id']
    if (!clientId) return sendJson(res, 401, { error: 'Missing session identifier' })
    if (!isLocalhost(req.headers.host) && !isSecure(req)) {
        return sendJson(res, 403, { error: 'HTTPS required for file transfers' })
    }

    const result = core.fileTransfer.getDownload(hash, clientId)
    if (!result) return sendJson(res, 404, { error: 'Download not found or unauthorized' })

    res.writeHead(200, {
        'Content-Type': result.contentType,
        'Content-Length': result.data.length || result.data.byteLength
    })
    res.end(result.data)
}

function handleUpload(req, res, match, core) {
    const { queryId, pathHash } = match

    if (!isLocalhost(req.headers.host) && !isSecure(req)) {
        return sendJson(res, 403, { error: 'HTTPS required for file transfers' })
    }

    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
        const data = Buffer.concat(chunks)

        if (core.fileTransfer.isStreamingFile(pathHash)) {
            const success = core.fileTransfer.completeStreamingUpload(pathHash, data)
            if (success) return sendJson(res, 200, { success: true, streaming: true })
            return sendJson(res, 404, { error: 'Streaming file not found' })
        }

        const clientId = getCookie(req.headers, 'apeClientId') || req.headers['x-ape-client-id']
        if (!clientId) return sendJson(res, 401, { error: 'Missing session identifier' })

        const success = core.fileTransfer.receiveUpload(queryId, pathHash, data, clientId)
        if (success) {
            sendJson(res, 200, { success: true })
        } else {
            sendJson(res, 404, { error: 'Upload not expected or unauthorized' })
        }
    })
    req.on('error', (err) => sendJson(res, 500, { error: err.message }))
}

module.exports = { initNodeServer }
