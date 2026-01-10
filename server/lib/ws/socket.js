/**
 * WebSocket connection class - wraps TCP socket with frame protocol
 * @module server/lib/ws/socket
 */

const { EventEmitter } = require('events')
const { OPCODES, parseFrame, buildFrame, buildCloseFrame, buildPongFrame, parseClosePayload } = require('./frames')

const READY_STATES = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }

class WebSocket extends EventEmitter {
    constructor(socket) {
        super()
        this._socket = socket
        this._readyState = READY_STATES.OPEN
        this._buffer = Buffer.alloc(0)
        this._fragments = []
        this._fragmentOpcode = null
        this.CONNECTING = READY_STATES.CONNECTING
        this.OPEN = READY_STATES.OPEN
        this.CLOSING = READY_STATES.CLOSING
        this.CLOSED = READY_STATES.CLOSED
        this._setupSocketListeners()
    }

    get readyState() { return this._readyState }

    send(data) {
        if (this._readyState !== READY_STATES.OPEN) throw new Error('WebSocket is not open')
        const opcode = Buffer.isBuffer(data) ? OPCODES.BINARY : OPCODES.TEXT
        this._socket.write(buildFrame(data, opcode))
    }

    close(code = 1000, reason = '') {
        if (this._readyState === READY_STATES.CLOSING || this._readyState === READY_STATES.CLOSED) return
        this._readyState = READY_STATES.CLOSING
        this._socket.write(buildCloseFrame(code, reason))
        setTimeout(() => {
            if (this._readyState !== READY_STATES.CLOSED) this._socket.destroy()
        }, 100)
    }

    _setupSocketListeners() {
        this._socket.on('data', (data) => this._handleData(data))
        this._socket.on('close', () => { this._readyState = READY_STATES.CLOSED; this.emit('close') })
        this._socket.on('error', (err) => this.emit('error', err))
    }

    _handleData(data) {
        this._buffer = Buffer.concat([this._buffer, data])
        while (this._buffer.length > 0) {
            const result = parseFrame(this._buffer)
            if (!result) break
            this._buffer = this._buffer.slice(result.bytesConsumed)
            this._handleFrame(result.frame)
        }
    }

    _handleFrame({ fin, opcode, payload }) {
        switch (opcode) {
            case OPCODES.CONTINUATION: this._handleContinuation(fin, payload); break
            case OPCODES.TEXT:
            case OPCODES.BINARY:
                if (fin) { this.emit('message', payload) }
                else { this._fragments = [payload]; this._fragmentOpcode = opcode }
                break
            case OPCODES.CLOSE: this._handleClose(payload); break
            case OPCODES.PING: this._handlePing(payload); break
            case OPCODES.PONG: break
            default: this.close(1002, 'Unknown opcode')
        }
    }

    _handleContinuation(fin, payload) {
        if (!this._fragmentOpcode) { this.close(1002, 'Unexpected continuation'); return }
        this._fragments.push(payload)
        if (fin) {
            this.emit('message', Buffer.concat(this._fragments))
            this._fragments = []
            this._fragmentOpcode = null
        }
    }

    _handleClose(payload) {
        const { code } = parseClosePayload(payload)
        if (this._readyState === READY_STATES.OPEN) {
            this._readyState = READY_STATES.CLOSING
            this._socket.write(buildCloseFrame(code), () => this._socket.destroy())
        } else {
            this._socket.destroy()
        }
        this._readyState = READY_STATES.CLOSED
    }

    _handlePing(payload) {
        if (this._readyState === READY_STATES.OPEN) this._socket.write(buildPongFrame(payload))
    }
}

module.exports = { WebSocket, READY_STATES }
