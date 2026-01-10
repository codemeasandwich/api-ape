/**
 * Long polling POST handler - send messages
 * @module server/lib/longPolling/postHandler
 */

const { broadcast, clients } = require('../broadcast')
const jss = require('../../../utils/jss')

function getClientId(req) {
    const cookies = req.headers.cookie || ''
    const match = cookies.match(/(?:^|;\s*)apeClientId=([^;]*)/)
    return match ? match[1] : null
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
}

function createPostHandler(streamClients) {
    return function handleStreamPost(req, res, controllers) {
        const clientId = getClientId(req)
        if (!clientId) return sendJson(res, 401, { error: 'Missing session. GET /api/ape/poll first.' })

        const chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', async () => {
            try {
                const body = Buffer.concat(chunks).toString('utf8')
                const { type: rawType, data } = jss.parse(body)
                const type = rawType.replace(/^\//, '').toLowerCase()

                const controller = controllers[type]
                if (!controller) return sendJson(res, 404, { error: `Controller "${type}" not found` })

                const clientState = streamClients.get(clientId)
                const embedValues = clientState?.embed || {}

                const sessionIdMatch = (req.headers.cookie || '').match(/(?:^|;\s*)sessionId=([^;]*)/)
                const sessionId = sessionIdMatch ? sessionIdMatch[1] : null

                const context = {
                    ...embedValues,
                    clientId,
                    sessionId,
                    req,
                    broadcast: (t, d) => broadcast(t, d),
                    broadcastOthers: (t, d) => broadcast(t, d, clientId),
                    clients
                }

                const result = await controller.call(context, data)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(jss.stringify({ data: result }))
            } catch (err) {
                sendJson(res, 500, { error: err.message || String(err) })
            }
        })
        req.on('error', (err) => sendJson(res, 500, { error: err.message }))
    }
}

module.exports = { createPostHandler, getClientId, sendJson }
