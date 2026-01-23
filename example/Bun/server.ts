/// <reference types="bun-types" />

/**
 * Bun server using api-ape library with native Bun.serve() WebSocket
 * Uses the apeBun() pattern for full control over routing
 */

import path from 'path'

const { apeBun } = require('api-ape/bun')
const { clients, publish } = require('api-ape')

const port = parseInt(process.env.PORT || '3000', 10)

// Message history
const _messages: { user: string; text: string; time: number }[] = []

// Initialize api-ape handlers first
const ape = apeBun({
    where: 'api',
    onConnect: (socket: any, req: any, send: (type: string, data: any) => void) => {
        send('init', { history: _messages, users: clients.size })
        publish.users({ count: clients.size })

        return {
            onDisconnect: () => publish.users({ count: clients.size })
        }
    }
})

// Create Bun server with combined routing
const server = Bun.serve({
    port,

    fetch(req, server) {
        // Try api-ape routes first (WebSocket, client bundle, etc.)
        const apeResponse = ape.fetch(req, server)
        if (apeResponse !== null) return apeResponse

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

    // Use api-ape's websocket handlers
    websocket: ape.websocket
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
