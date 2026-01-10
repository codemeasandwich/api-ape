/**
 * Long polling GET handler - streaming receive
 * @module server/lib/longPolling/getHandler
 */

const { addClient, removeClient, updateClientEmbed } = require('../broadcast')
const makeid = require('../../utils/genId')
const jss = require('../../../utils/jss')
const parseUserAgent = require('../../utils/parseUserAgent')

function ensureClientId(req, res) {
    const cookies = req.headers.cookie || ''
    const match = cookies.match(/(?:^|;\s*)apeClientId=([^;]*)/)
    if (match) return match[1]
    const clientId = makeid(20)
    res.setHeader('Set-Cookie', `apeClientId=${clientId}; Path=/; HttpOnly; SameSite=Strict`)
    return clientId
}

function createGetHandler(streamClients, onConnect) {
    return function handleStreamGet(req, res) {
        const clientId = ensureClientId(req, res)

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        })

        const clientState = { res, messageQueue: [], heartbeatTimer: null, isActive: true }

        const send = (type, data, err) => {
            if (!clientState.isActive) return
            try { res.write(jss.stringify({ type, data, err: err || undefined })) }
            catch (e) { cleanup() }
        }
        send.toString = () => clientId

        const cleanup = () => {
            if (!clientState.isActive) return
            clientState.isActive = false
            if (clientState.heartbeatTimer) clearInterval(clientState.heartbeatTimer)
            streamClients.delete(clientId)
            removeClient({ clientId })
            if (clientState.onDisconnect) clientState.onDisconnect()
        }

        req.on('close', cleanup)
        req.on('error', cleanup)
        res.on('error', cleanup)

        clientState.heartbeatTimer = setInterval(() => {
            if (!clientState.isActive) return
            try { res.write('{"type":"__heartbeat__"}') }
            catch (e) { cleanup() }
        }, 20000)

        const sessionIdMatch = (req.headers.cookie || '').match(/(?:^|;\s*)sessionId=([^;]*)/)
        const sessionId = sessionIdMatch ? sessionIdMatch[1] : null
        const agent = parseUserAgent(req.headers['user-agent'])

        addClient({ clientId, sessionId, agent, send, embed: null })
        streamClients.set(clientId, clientState)

        if (onConnect) {
            Promise.resolve(onConnect(null, req, send)).then(handlers => {
                if (handlers) {
                    if (handlers.onDisconnect) clientState.onDisconnect = handlers.onDisconnect
                    if (handlers.embed) {
                        clientState.embed = handlers.embed
                        updateClientEmbed(clientId, handlers.embed)
                    }
                }
            }).catch(err => console.error('onConnect error:', err))
        }

        setTimeout(() => { cleanup(); try { res.end() } catch (e) { } }, 25000)
    }
}

module.exports = { createGetHandler, ensureClientId }
