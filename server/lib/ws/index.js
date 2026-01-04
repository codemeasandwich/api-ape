/**
 * WebSocket polyfill entry point
 * Provides WebSocketServer compatible with the ws library API
 */

const { WebSocketServer } = require('./server')
const { WebSocket, READY_STATES } = require('./socket')
const { OPCODES } = require('./frames')

module.exports = {
    WebSocketServer,
    WebSocket,
    READY_STATES,
    OPCODES
}
