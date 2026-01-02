/**
 * Custom Next.js server using actual api-ape library with Express
 */

const express = require('express')
const next = require('next')
const ape = require('api-ape')
const { onConnect } = require('./ape/onConnect')

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT, 10) || 3000

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
    const server = express()

    // Initialize api-ape - it handles EVERYTHING
    // Developer never touches WebSocket!
    ape(server, { where: 'api', onConnent: onConnect })

    // Let Next.js handle all other routes
    server.all('*', (req, res) => {
        return handle(req, res)
    })

    server.listen(port, () => {
        console.log(`
╔═══════════════════════════════════════════════════════╗
║       🦍 api-ape NextJS Demo                          ║
╠═══════════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${port}/                  ║
║  WebSocket: ws://localhost:${port}/api/ape             ║
║  ape(app, { where: "api", onConnent })                ║
╚═══════════════════════════════════════════════════════╝
    `)
    })
})
