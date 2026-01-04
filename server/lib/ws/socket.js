/**
 * WebSocket connection class
 * Wraps a TCP socket and handles WebSocket frame protocol
 */

const { EventEmitter } = require('events')
const {
    OPCODES,
    parseFrame,
    buildFrame,
    buildCloseFrame,
    buildPongFrame,
    parseClosePayload
} = require('./frames')

// WebSocket ready states (matching ws library)
const READY_STATES = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
}

class WebSocket extends EventEmitter {
    constructor(socket) {
        super()
        this._socket = socket
        this._readyState = READY_STATES.OPEN
        this._buffer = Buffer.alloc(0)
        this._fragments = []
        this._fragmentOpcode = null

        // Define constants on instance (matching ws library API)
        this.CONNECTING = READY_STATES.CONNECTING
        this.OPEN = READY_STATES.OPEN
        this.CLOSING = READY_STATES.CLOSING
        this.CLOSED = READY_STATES.CLOSED

        this._setupSocketListeners()
    }

    get readyState() {
        return this._readyState
    }

    /**
     * Send data to the client
     * @param {string|Buffer} data - Data to send
     */
    send(data) {
        if (this._readyState !== READY_STATES.OPEN) {
            throw new Error('WebSocket is not open')
        }

        const opcode = Buffer.isBuffer(data) ? OPCODES.BINARY : OPCODES.TEXT
        const frame = buildFrame(data, opcode)
        this._socket.write(frame)
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
        const frame = buildCloseFrame(code, reason)
        this._socket.write(frame)

        // Give time for close frame to send, then destroy
        setTimeout(() => {
            if (this._readyState !== READY_STATES.CLOSED) {
                this._socket.destroy()
            }
        }, 100)
    }

    /**
     * Set up TCP socket event handlers
     */
    _setupSocketListeners() {
        this._socket.on('data', (data) => {
            this._handleData(data)
        })

        this._socket.on('close', () => {
            this._readyState = READY_STATES.CLOSED
            this.emit('close')
        })

        this._socket.on('error', (err) => {
            this.emit('error', err)
        })
    }

    /**
     * Handle incoming data, parse frames
     * @param {Buffer} data - Incoming data chunk
     */
    _handleData(data) {
        // Append to buffer
        this._buffer = Buffer.concat([this._buffer, data])

        // Process all complete frames in buffer
        while (this._buffer.length > 0) {
            const result = parseFrame(this._buffer)
            if (!result) break // Incomplete frame

            const { frame, bytesConsumed } = result
            this._buffer = this._buffer.slice(bytesConsumed)

            this._handleFrame(frame)
        }
    }

    /**
     * Handle a parsed frame
     * @param {{ fin: boolean, opcode: number, payload: Buffer }} frame
     */
    _handleFrame(frame) {
        const { fin, opcode, payload } = frame

        switch (opcode) {
            case OPCODES.CONTINUATION:
                this._handleContinuation(fin, payload)
                break

            case OPCODES.TEXT:
            case OPCODES.BINARY:
                if (fin) {
                    // Complete message
                    this._emitMessage(opcode, payload)
                } else {
                    // Start of fragmented message
                    this._fragments = [payload]
                    this._fragmentOpcode = opcode
                }
                break

            case OPCODES.CLOSE:
                this._handleClose(payload)
                break

            case OPCODES.PING:
                this._handlePing(payload)
                break

            case OPCODES.PONG:
                // Pong received, could emit event if needed
                break

            default:
                // Unknown opcode, close connection
                this.close(1002, 'Unknown opcode')
        }
    }

    /**
     * Handle continuation frame for fragmented messages
     */
    _handleContinuation(fin, payload) {
        if (!this._fragmentOpcode) {
            this.close(1002, 'Unexpected continuation frame')
            return
        }

        this._fragments.push(payload)

        if (fin) {
            const completePayload = Buffer.concat(this._fragments)
            this._emitMessage(this._fragmentOpcode, completePayload)
            this._fragments = []
            this._fragmentOpcode = null
        }
    }

    /**
     * Emit message event
     */
    _emitMessage(opcode, payload) {
        // For text, convert to string; for binary, keep as Buffer
        // But ws library emits Buffer by default, so we match that
        this.emit('message', payload)
    }

    /**
     * Handle close frame
     */
    _handleClose(payload) {
        const { code, reason } = parseClosePayload(payload)

        if (this._readyState === READY_STATES.OPEN) {
            // Send close frame back
            this._readyState = READY_STATES.CLOSING
            const frame = buildCloseFrame(code)
            this._socket.write(frame, () => {
                this._socket.destroy()
            })
        } else {
            this._socket.destroy()
        }

        this._readyState = READY_STATES.CLOSED
    }

    /**
     * Handle ping frame - respond with pong
     */
    _handlePing(payload) {
        if (this._readyState === READY_STATES.OPEN) {
            const pong = buildPongFrame(payload)
            this._socket.write(pong)
        }
    }
}

module.exports = { WebSocket, READY_STATES }
