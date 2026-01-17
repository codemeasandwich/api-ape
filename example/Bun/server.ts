/// <reference types="bun-types" />

/**
 * Bun server using api-ape library with native Bun.serve() WebSocket
 * Uses the SAME unified signature as Node.js/Express: ape(server, { where: 'api' })
 */

import path from 'path'

const { ape } = require('api-ape')

const port = parseInt(process.env.PORT || '3000', 10)

// Message history
const _messages: { user: string; text: string; time: number }[] = []

// Create Bun server first
const server = Bun.serve({
    port,

    fetch(req) {
        const url = new URL(req.url)

        // Serve static files
        if (url.pathname === '/') {
            return new Response(Bun.file(path.join(import.meta.dir, 'index.html')))
        }

        if (url.pathname === '/styles.css') {
            return new Response(Bun.file(path.join(import.meta.dir, 'styles.css')))
        }

        return new Response('Not Found', { status: 404 })
    },

    // Required: Enables WebSocket support. ape() replaces via server.reload()
    websocket: { message() { } }
})

// Initialize api-ape with the Bun server - SAME signature as Node.js/Express!
ape(server, {
    where: 'api',
    onConnect: (socket: any, req: any, send: (type: string, data: any) => void) => {
        send('init', { history: _messages, users: ape.clients.size })
        ape.publish.users({ count: ape.clients.size })

        return {
            onDisconnect: () => ape.publish.users({ count: ape.clients.size })
        }
    }
})

console.log(`
╔═══════════════════════════════════════════════════════╗
║       🦍 api-ape Bun Example (Native WebSocket)       ║
╠═══════════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${port}/                  ║
║  WebSocket: ws://localhost:${port}/api/ape             ║
║  Unified:   ape(server, { where: 'api' })             ║
╚═══════════════════════════════════════════════════════╝
`)
