/**
 * Custom Next.js server using api-ape library without Express
 */

const { createServer } = require('http')
const next = require('next')
const { ape } = require('api-ape')
const { onConnect } = require('./ape/onConnect')

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT, 10) || 3000

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
    const server = createServer((req, res) => {
        return handle(req, res)
    })

    // Initialize api-ape with the raw http server
    ape(server, { where: 'api', onConnect })

    server.listen(port, () => {
        console.log(`
╔═══════════════════════════════════════════════════════╗
║       api-ape NextJS Demo                             ║
╠═══════════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${port}/                  ║
║  WebSocket: ws://localhost:${port}/api/ape             ║
║  ape(server, { where: "api", onConnect })              ║
╚═══════════════════════════════════════════════════════╝
    `)
    })
})
