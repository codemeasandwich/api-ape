/**
 * Bun integration for api-ape
 * @module server/lib/runtimes/bun
 */

const path = require('path')
const fs = require('fs')
const { isBun } = require('../wsProvider')

function isBunServer(server) {
    return isBun() && typeof server?.reload === 'function'
}

function initBunServer(options, core) {
    const { BunWebSocket } = require('../ws/adapters/bun')
    const clients = new Map()

    function fetch(req, server) {
        const url = new URL(req.url)
        const pathname = url.pathname

        if (pathname === core.wsPath) {
            const upgrade = req.headers.get('upgrade')
            if (upgrade?.toLowerCase() === 'websocket') {
                const success = server.upgrade(req, { data: { req } })
                if (success) return undefined
                return new Response('WebSocket upgrade failed', { status: 500 })
            }
        }

        if (pathname === core.clientPath) {
            try {
                const filePath = path.join(__dirname, '../../../dist/ape.js')
                const data = fs.readFileSync(filePath)
                return new Response(data, { headers: { 'Content-Type': 'application/javascript' } })
            } catch {
                return new Response('Client bundle not found', { status: 500 })
            }
        }

        if (pathname === core.clientMapPath) {
            try {
                const filePath = path.join(__dirname, '../../../dist/ape.js.map')
                const data = fs.readFileSync(filePath)
                return new Response(data, { headers: { 'Content-Type': 'application/json' } })
            } catch {
                return new Response('Source map not found', { status: 404 })
            }
        }

        if (pathname === core.pingPath && req.method === 'GET') {
            return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
                headers: { 'Content-Type': 'application/json' }
            })
        }

        return null
    }

    const websocket = {
        open(ws) {
            const wrapper = new BunWebSocket(ws)
            clients.set(ws, wrapper)
            const { req } = ws.data || {}
            core.wiringHandler(wrapper, req)
        },
        message(ws, message) {
            const wrapper = clients.get(ws)
            if (wrapper) wrapper._onMessage(message)
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
            if (wrapper) wrapper._onError(error)
        }
    }

    return { fetch, websocket, clients, core }
}

function initBunServerWithReload(server, options, core) {
    const { BunWebSocket } = require('../ws/adapters/bun')
    const clients = new Map()

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

If you only want HTTP long-polling, pass: ape(server, { where: 'api', transport: 'longpolling' })
`)
    }

    const originalFetch = server.fetch

    function wrappedFetch(req, server) {
        const url = new URL(req.url)
        const pathname = url.pathname

        if (pathname === core.wsPath) {
            const upgrade = req.headers.get('upgrade')
            if (upgrade?.toLowerCase() === 'websocket') {
                const success = server.upgrade(req, { data: { req } })
                if (success) return undefined
                return new Response('WebSocket upgrade failed', { status: 500 })
            }
        }

        if (pathname === core.clientPath) {
            try {
                const filePath = path.join(__dirname, '../../../dist/ape.js')
                const data = fs.readFileSync(filePath)
                return new Response(data, { headers: { 'Content-Type': 'application/javascript' } })
            } catch {
                return new Response('Client bundle not found', { status: 500 })
            }
        }

        if (pathname === core.clientMapPath) {
            try {
                const filePath = path.join(__dirname, '../../../dist/ape.js.map')
                const data = fs.readFileSync(filePath)
                return new Response(data, { headers: { 'Content-Type': 'application/json' } })
            } catch {
                return new Response('Source map not found', { status: 404 })
            }
        }

        if (pathname === core.pingPath && req.method === 'GET') {
            return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
                headers: { 'Content-Type': 'application/json' }
            })
        }

        if (originalFetch) return originalFetch(req, server)
        return new Response('Not Found', { status: 404 })
    }

    const websocket = {
        open(ws) {
            const wrapper = new BunWebSocket(ws)
            clients.set(ws, wrapper)
            const { req } = ws.data || {}
            core.wiringHandler(wrapper, req)
        },
        message(ws, message) {
            const wrapper = clients.get(ws)
            if (wrapper) wrapper._onMessage(message)
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
            if (wrapper) wrapper._onError(error)
        }
    }

    server.reload({ fetch: wrappedFetch, websocket })

    return { clients, core }
}

module.exports = { isBunServer, initBunServer, initBunServerWithReload }
