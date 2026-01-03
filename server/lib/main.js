const loader = require('./loader')
const wiring = require('./wiring')
const expressWs = require('express-ws');
const path = require('path');
const { getFileTransferManager } = require('./fileTransfer');

let created = false

module.exports = function (app, { where, onConnent, fileTransferOptions }) {

    if (created) {
        throw new Error("Api-Ape already started")
    }
    created = true;
    expressWs(app)
    const controllers = loader(where)

    // Initialize file transfer manager
    const fileTransfer = getFileTransferManager(fileTransferOptions)

    // Serve bundled client at /ape.js
    app.get('/api/ape.js', (req, res) => {
        res.sendFile(path.join(__dirname, '../../dist/ape.js'))
    })

    // File download endpoint - GET /api/ape/data/:hash
    app.get('/api/ape/data/:hash', (req, res) => {
        const { hash } = req.params

        // Get hostId from session/cookie (set during WS connection)
        const hostId = req.cookies?.apeHostId || req.headers['x-ape-host-id']

        if (!hostId) {
            return res.status(401).json({ error: 'Missing session identifier' })
        }

        // Enforce HTTPS in production
        const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)
        if (!isLocal && !req.secure && req.get('x-forwarded-proto') !== 'https') {
            return res.status(403).json({ error: 'HTTPS required for file transfers' })
        }

        const result = fileTransfer.getDownload(hash, hostId)

        if (!result) {
            return res.status(404).json({ error: 'Download not found or unauthorized' })
        }

        res.set('Content-Type', result.contentType)
        res.set('Content-Length', result.data.length || result.data.byteLength)
        res.send(result.data)
    })

    // File upload endpoint - PUT /api/ape/data/:queryId/:pathHash
    app.put('/api/ape/data/:queryId/:pathHash', (req, res) => {
        const { queryId, pathHash } = req.params

        // Get hostId from session/cookie
        const hostId = req.cookies?.apeHostId || req.headers['x-ape-host-id']

        if (!hostId) {
            return res.status(401).json({ error: 'Missing session identifier' })
        }

        // Enforce HTTPS in production
        const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)
        if (!isLocal && !req.secure && req.get('x-forwarded-proto') !== 'https') {
            return res.status(403).json({ error: 'HTTPS required for file transfers' })
        }

        // Collect body as buffer
        const chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => {
            const data = Buffer.concat(chunks)
            const success = fileTransfer.receiveUpload(queryId, pathHash, data, hostId)

            if (success) {
                res.json({ success: true })
            } else {
                res.status(404).json({ error: 'Upload not expected or unauthorized' })
            }
        })
        req.on('error', (err) => {
            res.status(500).json({ error: err.message })
        })
    })

    // Pass fileTransfer to wiring so send.js can register downloads
    app.ws('/api/ape', wiring(controllers, onConnent, fileTransfer))
}