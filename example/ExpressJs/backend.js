const express = require('express')
const path = require('path')
const { ape } = require('api-ape')

const app = express()

// Serve static files
// NOTE: For production, consider adding rate limiting middleware (e.g., express-rate-limit)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')))
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')))

// Find available port
const net = require('net')
const findPort = (port, cb) => {
  const server = net.createServer()
  server.once('error', () => findPort(port + 1, cb))
  server.once('listening', () => server.close(() => cb(port)))
  server.listen(port)
}

findPort(3000, port => {
  // Create HTTP server from Express app
  const server = app.listen(port, () => console.log(`http://localhost:${port}`))

  // Initialize api-ape with the HTTP server
  ape(server, {
    where: 'api',
    onConnect: (socket, req, send) => {
      const { _messages } = require('./api/message')
      send('init', { history: _messages, users: ape.clients.size })
      ape.publish.users({ count: ape.clients.size })

      return {
        onDisconnect: () => ape.publish.users({ count: ape.clients.size })
      }
    }
  })
})
