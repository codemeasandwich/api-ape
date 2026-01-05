/**
 * Bun-specific api-ape integration
 * Returns handlers for use with Bun.serve()
 * 
 * Usage:
 * ```ts
 * import { apeBun } from 'api-ape/bun'
 * 
 * const ape = apeBun({ where: 'api', onConnect: ... })
 * 
 * Bun.serve({
 *   port: 3000,
 *   fetch: ape.fetch,
 *   websocket: ape.websocket
 * })
 * ```
 */

const loader = require('./loader')
const wiring = require('./wiring')
const path = require('path')
const fs = require('fs')
const { getFileTransferManager } = require('./fileTransfer')
const { BunWebSocket, BunWebSocketServer } = require('./ws/adapters/bun')

/**
 * Create api-ape handlers for Bun.serve()
 * @param {{ where: string, onConnect?: Function, fileTransferOptions?: Object }} options
 */
function apeBun({ where, onConnect, fileTransferOptions }) {
    const controllers = loader(where)
    const fileTransfer = getFileTransferManager(fileTransferOptions)
    const wss = new BunWebSocketServer({ noServer: true })

    const wsPath = `/${where}/ape`
    const wiringHandler = wiring(controllers, onConnect, fileTransfer)

    // Handle connections
    wss.on('connection', wiringHandler)

    /**
     * Bun fetch handler - handles HTTP requests and WebSocket upgrades
     */
    function fetch(req, server) {
        const url = new URL(req.url)
        const pathname = url.pathname

        // WebSocket upgrade
        if (pathname === wsPath) {
            const upgrade = req.headers.get('upgrade')
            if (upgrade?.toLowerCase() === 'websocket') {
                // Use Bun's native upgrade
                const success = server.upgrade(req, {
                    data: { req }
                })
                if (success) {
                    return undefined // Bun handles the response
                }
                return new Response('WebSocket upgrade failed', { status: 500 })
            }
        }

        // Serve client bundle
        if (pathname === `/${where}/ape.js`) {
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

        // Not an api-ape route
        return null
    }

    /**
     * Bun websocket handlers
     */
    const websocket = {
        open(ws) {
            const wrapper = new BunWebSocket(ws)
            wss._clients.set(ws, wrapper)

            const { req } = ws.data || {}
            wiringHandler(wrapper, req)
        },

        message(ws, message) {
            const wrapper = wss._clients.get(ws)
            if (wrapper) {
                wrapper._onMessage(message)
            }
        },

        close(ws, code, reason) {
            const wrapper = wss._clients.get(ws)
            if (wrapper) {
                wrapper._onClose(code, reason)
                wss._clients.delete(ws)
            }
        },

        error(ws, error) {
            const wrapper = wss._clients.get(ws)
            if (wrapper) {
                wrapper._onError(error)
            }
        }
    }

    return {
        fetch,
        websocket,
        wss
    }
}

module.exports = { apeBun }
