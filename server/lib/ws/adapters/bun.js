/**
 * Bun Native WebSocket Adapter
 * Wraps Bun's ServerWebSocket to be compatible with the ws library API
 * 
 * Bun uses a different pattern:
 * - Bun.serve({ websocket: { open, message, close, ... } })
 * - server.upgrade(req) to upgrade connections
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
 * Wrapper around Bun's ServerWebSocket to provide ws-compatible API
 */
class BunWebSocket extends EventEmitter {
    constructor(bunSocket) {
        super()
        this._socket = bunSocket
        this._readyState = READY_STATES.OPEN

        // Define constants on instance (matching ws library API)
        this.CONNECTING = READY_STATES.CONNECTING
        this.OPEN = READY_STATES.OPEN
        this.CLOSING = READY_STATES.CLOSING
        this.CLOSED = READY_STATES.CLOSED
    }

    get readyState() {
        return this._readyState
    }

    /**
     * Send data to the client
     * @param {string|Buffer|ArrayBuffer} data - Data to send
     */
    send(data) {
        if (this._readyState !== READY_STATES.OPEN) {
            throw new Error('WebSocket is not open')
        }
        this._socket.send(data)
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

    /**
     * Called by BunWebSocketServer when message received
     * @internal
     */
    _onMessage(data) {
        // Convert to Buffer for consistency with ws library
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
        this.emit('message', buffer)
    }

    /**
     * Called by BunWebSocketServer when connection closed
     * @internal
     */
    _onClose(code, reason) {
        this._readyState = READY_STATES.CLOSED
        this.emit('close', code, reason)
    }

    /**
     * Called by BunWebSocketServer on error
     * @internal
     */
    _onError(error) {
        this.emit('error', error)
    }
}

/**
 * WebSocketServer compatible with Bun's server.upgrade() pattern
 * 
 * Usage in main.js:
 * - Create BunWebSocketServer
 * - It provides the websocket handlers for Bun.serve()
 * - Call handleUpgrade() when upgrade request received
 */
class BunWebSocketServer extends EventEmitter {
    constructor(options = {}) {
        super()
        this._noServer = options.noServer || false
        this._clients = new Map() // Map socket -> BunWebSocket wrapper

        // Bun websocket handler configuration
        // This will be used by the integration in main.js
        this.websocketHandlers = {
            open: (ws) => this._handleOpen(ws),
            message: (ws, message) => this._handleMessage(ws, message),
            close: (ws, code, reason) => this._handleClose(ws, code, reason),
            error: (ws, error) => this._handleError(ws, error)
        }
    }

    /**
     * Get all connected clients
     * @returns {Set<BunWebSocket>}
     */
    get clients() {
        return new Set(this._clients.values())
    }

    /**
     * Handle upgrade request - called from main.js
     * For Bun, we need to return info for the upgrade
     * @param {Request} req - Bun Request object
     * @param {*} server - Bun server instance
     * @param {*} head - Not used in Bun
     * @param {function} callback - Called with wrapped WebSocket
     */
    handleUpgrade(req, server, head, callback) {
        // In Bun, we store the callback and req info
        // The actual upgrade happens via server.upgrade()
        // The callback will be called in _handleOpen when Bun calls our open handler

        // Store pending upgrade info keyed by some identifier
        // Bun's server.upgrade() succeeds/fails synchronously
        const upgraded = server.upgrade(req, {
            data: { callback, req }
        })

        if (!upgraded) {
            // Upgrade failed
            return false
        }

        return true
    }

    /**
     * Handle Bun websocket open event
     * @internal
     */
    _handleOpen(bunSocket) {
        const wrapper = new BunWebSocket(bunSocket)
        this._clients.set(bunSocket, wrapper)

        // Get the callback from upgrade data
        const { callback, req } = bunSocket.data || {}

        if (callback) {
            callback(wrapper)
        }

        // Emit connection event
        this.emit('connection', wrapper, req)
    }

    /**
     * Handle Bun websocket message event
     * @internal
     */
    _handleMessage(bunSocket, message) {
        const wrapper = this._clients.get(bunSocket)
        if (wrapper) {
            wrapper._onMessage(message)
        }
    }

    /**
     * Handle Bun websocket close event
     * @internal
     */
    _handleClose(bunSocket, code, reason) {
        const wrapper = this._clients.get(bunSocket)
        if (wrapper) {
            wrapper._onClose(code, reason)
            this._clients.delete(bunSocket)
        }
    }

    /**
     * Handle Bun websocket error event
     * @internal
     */
    _handleError(bunSocket, error) {
        const wrapper = this._clients.get(bunSocket)
        if (wrapper) {
            wrapper._onError(error)
        }
    }

    /**
     * Close server and all connections
     */
    close(callback) {
        for (const [bunSocket, wrapper] of this._clients) {
            wrapper.close(1001, 'Server shutting down')
        }
        this._clients.clear()
        if (callback) {
            callback()
        }
    }
}

module.exports = {
    BunWebSocket,
    BunWebSocketServer
}
