/**
 * Vite + Vue server using api-ape library (TypeScript)
 * Matches the NextJs example structure
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import fs from 'fs'
const { ape } = require('api-ape')
import { onConnect } from './ape/onConnect'

const port = parseInt(process.env.PORT || '3000', 10)
const isProd = process.env.NODE_ENV === 'production'
const distPath = path.join(__dirname, 'dist')

// Create HTTP server
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`)

    // In production, serve built Vue app
    if (isProd) {
        let filePath = path.join(distPath, url.pathname === '/' ? 'index.html' : url.pathname)

        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath)
            const contentTypes: Record<string, string> = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.svg': 'image/svg+xml',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
            }
            res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' })
            res.end(fs.readFileSync(filePath))
            return
        }
    }

    res.writeHead(404)
    res.end('Not Found - Run Vite dev server on port 5173 for development')
})

// Initialize api-ape with onConnect handler from ape folder
ape(server, {
    where: 'api',
    onConnect: onConnect
})

server.listen(port, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║       🦍 api-ape Vite + Vue Example                   ║
╠═══════════════════════════════════════════════════════╣
║  Backend:   http://localhost:${port}/                  ║
║  WebSocket: ws://localhost:${port}/api/ape             ║
${isProd
            ? `║  Mode:      Production (serving dist/)               ║`
            : `║  Frontend:  http://localhost:5173/ (run npm run dev:vue)║`}
╚═══════════════════════════════════════════════════════╝
`)
})
