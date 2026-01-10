/**
 * Bun Native WebSocket Adapter
 * @module server/lib/ws/adapters/bun
 */

const { EventEmitter } = require('events')

const READY_STATES = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }

class BunWebSocket extends EventEmitter {
    constructor(bunSocket) {
        super()
        this._socket = bunSocket
        this._readyState = READY_STATES.OPEN
        this.CONNECTING = READY_STATES.CONNECTING
        this.OPEN = READY_STATES.OPEN
        this.CLOSING = READY_STATES.CLOSING
        this.CLOSED = READY_STATES.CLOSED
    }

    get readyState() { return this._readyState }

    send(data) {
        if (this._readyState !== READY_STATES.OPEN) throw new Error('WebSocket is not open')
        this._socket.send(data)
    }

    close(code = 1000, reason = '') {
        if (this._readyState === READY_STATES.CLOSING || this._readyState === READY_STATES.CLOSED) return
        this._readyState = READY_STATES.CLOSING
        this._socket.close(code, reason)
    }

    _onMessage(data) {
        this.emit('message', Buffer.isBuffer(data) ? data : Buffer.from(data))
    }

    _onClose(code, reason) {
        this._readyState = READY_STATES.CLOSED
        this.emit('close', code, reason)
    }

    _onError(error) { this.emit('error', error) }
}

class BunWebSocketServer extends EventEmitter {
    constructor(options = {}) {
        super()
        this._noServer = options.noServer || false
        this._clients = new Map()
        this.websocketHandlers = {
            open: (ws) => this._handleOpen(ws),
            message: (ws, message) => this._handleMessage(ws, message),
            close: (ws, code, reason) => this._handleClose(ws, code, reason),
            error: (ws, error) => this._handleError(ws, error)
        }
    }

    get clients() { return new Set(this._clients.values()) }

    handleUpgrade(req, server, head, callback) {
        const upgraded = server.upgrade(req, { data: { callback, req } })
        return !!upgraded
    }

    _handleOpen(bunSocket) {
        const wrapper = new BunWebSocket(bunSocket)
        this._clients.set(bunSocket, wrapper)
        const { callback, req } = bunSocket.data || {}
        if (callback) callback(wrapper)
        this.emit('connection', wrapper, req)
    }

    _handleMessage(bunSocket, message) {
        const wrapper = this._clients.get(bunSocket)
        if (wrapper) wrapper._onMessage(message)
    }

    _handleClose(bunSocket, code, reason) {
        const wrapper = this._clients.get(bunSocket)
        if (wrapper) {
            wrapper._onClose(code, reason)
            this._clients.delete(bunSocket)
        }
    }

    _handleError(bunSocket, error) {
        const wrapper = this._clients.get(bunSocket)
        if (wrapper) wrapper._onError(error)
    }

    close(callback) {
        for (const [, wrapper] of this._clients) wrapper.close(1001, 'Server shutting down')
        this._clients.clear()
        if (callback) callback()
    }
}

module.exports = { BunWebSocket, BunWebSocketServer }
