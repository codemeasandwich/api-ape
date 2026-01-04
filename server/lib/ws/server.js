/**
 * WebSocketServer class
 * Handles HTTP upgrade requests and creates WebSocket connections
 */

const { EventEmitter } = require('events')
const { generateAcceptKey } = require('./frames')
const { WebSocket } = require('./socket')

class WebSocketServer extends EventEmitter {
    /**
     * Create WebSocket server
     * @param {{ noServer?: boolean }} options
     */
    constructor(options = {}) {
        super()
        this._noServer = options.noServer || false
        this._clients = new Set()
    }

    /**
     * Get all connected clients
     * @returns {Set<WebSocket>}
     */
    get clients() {
        return this._clients
    }

    /**
     * Handle HTTP upgrade request
     * @param {http.IncomingMessage} req - HTTP request
     * @param {net.Socket} socket - TCP socket
     * @param {Buffer} head - First packet of upgraded stream
     * @param {function} callback - Called with WebSocket instance
     */
    handleUpgrade(req, socket, head, callback) {
        // Validate WebSocket upgrade request
        const upgrade = req.headers['upgrade']
        if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
            socket.destroy()
            return
        }

        const key = req.headers['sec-websocket-key']
        if (!key) {
            socket.destroy()
            return
        }

        // Validate key is valid base64 (16 bytes = 24 chars base64)
        if (!/^[A-Za-z0-9+/]{22}==$/.test(key)) {
            socket.destroy()
            return
        }

        // Generate accept key
        const acceptKey = generateAcceptKey(key)

        // Build HTTP 101 response
        const headers = [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${acceptKey}`,
            '', ''  // Empty line to end headers
        ].join('\r\n')

        // Send handshake response
        socket.write(headers)

        // If there's buffered data after upgrade, process it
        // The 'head' contains any data received after the upgrade request
        // We'll handle this in the WebSocket's buffer

        // Create WebSocket wrapper
        const ws = new WebSocket(socket)
        this._clients.add(ws)

        // Remove from clients on close
        ws.on('close', () => {
            this._clients.delete(ws)
        })

        // Handle any buffered data
        if (head && head.length > 0) {
            socket.unshift(head)
        }

        // Call callback with the WebSocket
        if (callback) {
            callback(ws)
        }
    }

    /**
     * Close server and all connections
     */
    close(callback) {
        for (const client of this._clients) {
            client.close(1001, 'Server shutting down')
        }
        this._clients.clear()
        if (callback) {
            callback()
        }
    }
}

module.exports = { WebSocketServer }
