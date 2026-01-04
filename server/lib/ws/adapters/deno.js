/**
 * Deno Native WebSocket Adapter
 * Wraps Deno's native WebSocket to be compatible with the ws library API
 * 
 * Deno uses a different pattern:
 * - Deno.serve() with Deno.upgradeWebSocket(req)
 * - Returns { socket, response } where socket is a standard WebSocket
 * 
 * This adapter provides a ws-compatible WebSocketServer that works
 * with the existing api-ape code.
 */

const { EventEmitter } = require('events')

// WebSocket ready states (matching ws library)
const READY_STATES = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
}

/**
 * Wrapper around Deno's native WebSocket to provide ws-compatible API
 * Deno's WebSocket uses onmessage/onclose properties instead of EventEmitter
 */
class DenoWebSocket extends EventEmitter {
    constructor(denoSocket) {
        super()
        this._socket = denoSocket
        this._readyState = READY_STATES.OPEN

        // Define constants on instance (matching ws library API)
        this.CONNECTING = READY_STATES.CONNECTING
        this.OPEN = READY_STATES.OPEN
        this.CLOSING = READY_STATES.CLOSING
        this.CLOSED = READY_STATES.CLOSED

        // Wire up Deno's event properties to our EventEmitter
        this._setupDenoEvents()
    }

    get readyState() {
        return this._readyState
    }

    /**
     * Setup Deno WebSocket event handlers
     * @internal
     */
    _setupDenoEvents() {
        this._socket.onmessage = (event) => {
            // Convert to Buffer for consistency with ws library
            const data = event.data
            const buffer = typeof data === 'string'
                ? Buffer.from(data)
                : Buffer.from(data)
            this.emit('message', buffer)
        }

        this._socket.onclose = (event) => {
            this._readyState = READY_STATES.CLOSED
            this.emit('close', event.code, event.reason)
        }

        this._socket.onerror = (event) => {
            this.emit('error', event)
        }
    }

    /**
     * Send data to the client
     * @param {string|Buffer|ArrayBuffer} data - Data to send
     */
    send(data) {
        if (this._readyState !== READY_STATES.OPEN) {
            throw new Error('WebSocket is not open')
        }
        // Deno's WebSocket.send() accepts string, ArrayBuffer, or Blob
        if (Buffer.isBuffer(data)) {
            this._socket.send(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
        } else {
            this._socket.send(data)
        }
    }

    /**
     * Close the WebSocket connection
     * @param {number} code - Status code
     * @param {string} reason - Close reason
     */
    close(code = 1000, reason = '') {
        if (this._readyState === READY_STATES.CLOSING ||
            this._readyState === READY_STATES.CLOSED) {
            return
        }
        this._readyState = READY_STATES.CLOSING
        this._socket.close(code, reason)
    }
}

/**
 * WebSocketServer compatible with Deno's Deno.upgradeWebSocket() pattern
 * 
 * Usage in main.js:
 * - Create DenoWebSocketServer
 * - Call handleUpgrade() when upgrade request received
 * - It uses Deno.upgradeWebSocket() internally
 */
class DenoWebSocketServer extends EventEmitter {
    constructor(options = {}) {
        super()
        this._noServer = options.noServer || false
        this._clients = new Set()
    }

    /**
     * Get all connected clients
     * @returns {Set<DenoWebSocket>}
     */
    get clients() {
        return this._clients
    }

    /**
     * Handle upgrade request using Deno.upgradeWebSocket
     * @param {Request} req - Deno Request object
     * @param {*} _socket - Not used in Deno (placeholder for API compat)
     * @param {*} _head - Not used in Deno (placeholder for API compat)
     * @param {function} callback - Called with wrapped WebSocket
     * @returns {{ response: Response } | null} - Response to return from handler
     */
    handleUpgrade(req, _socket, _head, callback) {
        // Check for upgrade header
        const upgrade = req.headers.get('upgrade')
        if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
            return null
        }

        try {
            // Use Deno's built-in upgrade
            const { socket: denoSocket, response } = Deno.upgradeWebSocket(req)

            // Wrap with our adapter
            const wrapper = new DenoWebSocket(denoSocket)
            this._clients.add(wrapper)

            // Remove from clients on close
            wrapper.on('close', () => {
                this._clients.delete(wrapper)
            })

            // Call the callback with wrapped socket
            if (callback) {
                callback(wrapper)
            }

            // Emit connection event
            this.emit('connection', wrapper, req)

            // Return the response for Deno's handler
            return { response }
        } catch (err) {
            console.error('[api-ape] Deno WebSocket upgrade failed:', err)
            return null
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

module.exports = {
    DenoWebSocket,
    DenoWebSocketServer
}
