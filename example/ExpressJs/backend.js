const express = require('express')
const scribbles = require('scribbles')
const net = require('net')
const path = require('path')
const ape = require('api-ape')

const app = express()

const { online, broadcast } = require('api-ape/server/lib/broadcast')

ape(app, {
  where: 'api',
  onConnent: (socket, req, send) => {
    // Send history + user count on connect
    const { _messages } = require('./api/message')
    setTimeout(() => {
      send('init', { history: _messages, users: online() })
      broadcast('users', { count: online() })
    }, 100)

    return {
      onDisconnent: () => broadcast('users', { count: online() })
    }
  }
})

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')))
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')))

const findPort = (port, cb) => {
  const server = net.createServer()
  server.once('error', () => findPort(port + 1, cb))
  server.once('listening', () => server.close(() => cb(port)))
  server.listen(port)
}

findPort(3000, port => app.listen(port, () => scribbles.log(`http://localhost:${port}`)))
