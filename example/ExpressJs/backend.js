const express = require('express')
const scribbles = require('scribbles')
const net = require('net')
const path = require('path')
const ape = require('api-ape')

const app = express()

ape(app, { where: 'api' })

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')))

const findPort = (port, cb) => {
  const server = net.createServer()
  server.once('error', () => findPort(port + 1, cb))
  server.once('listening', () => server.close(() => cb(port)))
  server.listen(port)
}

findPort(3000, port => app.listen(port, () => scribbles.log(`http://localhost:${port}`)))
