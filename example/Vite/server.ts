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
// NOTE: For production, use HTTPS (via reverse proxy or https.createServer) and implement rate limiting
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`)

    // In production, serve built Vue app
    if (isProd) {
        // Resolve and normalize the path to prevent path traversal attacks
        const requestedPath = url.pathname === '/' ? 'index.html' : url.pathname
        const filePath = path.resolve(distPath, '.' + path.normalize('/' + requestedPath))

        // Ensure the resolved path is within distPath (prevent directory traversal)
        if (!filePath.startsWith(distPath + path.sep) && filePath !== distPath) {
            res.writeHead(403)
            res.end('Forbidden')
            return
        }

        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase()
            const contentTypes: Record<string, string> = {
                '.html': 'text/html; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8',
                '.svg': 'image/svg+xml',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.ico': 'image/x-icon',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.json': 'application/json; charset=utf-8',
            }

            // Only serve files with known extensions to prevent XSS
            const contentType = contentTypes[ext]
            if (!contentType) {
                res.writeHead(403)
                res.end('Forbidden')
                return
            }

            res.writeHead(200, {
                'Content-Type': contentType,
                'X-Content-Type-Options': 'nosniff',
            })
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
