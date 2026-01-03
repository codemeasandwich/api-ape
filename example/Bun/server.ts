/**
 * Bun server using api-ape library (TypeScript)
 * Bun natively supports TypeScript - no build step needed!
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import fs from 'fs'
import ape from 'api-ape'

const port = parseInt(process.env.PORT || '3000', 10)

// Create HTTP server
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`)

    if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(fs.readFileSync(path.join(__dirname, 'index.html')))
        return
    }

    if (url.pathname === '/styles.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' })
        res.end(fs.readFileSync(path.join(__dirname, 'styles.css')))
        return
    }

    res.writeHead(404)
    res.end('Not Found')
})

// Initialize api-ape
ape(server, {
    where: 'api',
    onConnent: (socket, req, send) => {
        const messageModule = require('./api/message')
        setTimeout(() => {
            send('init', { history: messageModule._messages, users: ape.online() })
            ape.broadcast('users', { count: ape.online() })
        }, 100)

        return {
            onDisconnent: () => ape.broadcast('users', { count: ape.online() })
        }
    }
})

server.listen(port, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║       🦍 api-ape Bun Example (TypeScript)             ║
╠═══════════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${port}/                  ║
║  WebSocket: ws://localhost:${port}/api/ape             ║
║  Runtime:   Bun 🥖 + TypeScript                       ║
╚═══════════════════════════════════════════════════════╝
`)
})
