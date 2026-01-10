/**
 * Client connection management
 * @module server/client/connection
 */

const jss = require('../../utils/jss')
const { WebSocket: WsPolyfill } = require('../lib/ws')

const WebSocket = globalThis.WebSocket || WsPolyfill

const ConnectionState = {
    Disconnected: 'disconnected',
    Connecting: 'connecting',
    Connected: 'connected',
    Closing: 'closing'
}

let ws = null
let connectionState = ConnectionState.Disconnected
const connectionChangeListeners = []
const waitingOn = {}
const receiverArray = []
const ofTypesOb = {}
let queryCounter = 0
let bufferedCalls = []
let bufferedReceivers = []
let ready = false
let reconnectEnabled = true
let reconnectTimer = null
let serverUrl = process.env.APE_SERVER || null

const connectTimeout = 5000
const totalRequestTimeout = 10000

function notifyConnectionChange(newState) {
    if (connectionState !== newState) {
        connectionState = newState
        connectionChangeListeners.forEach(fn => fn(newState))
    }
}

function generateQueryId() {
    return `q${Date.now().toString(36)}_${(queryCounter++).toString(36)}`
}

function send(type, data, createdAt = Date.now()) {
    const queryId = generateQueryId()
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            delete waitingOn[queryId]
            reject(new Error(`Request timeout: ${type}`))
        }, totalRequestTimeout)

        waitingOn[queryId] = (err, result) => {
            clearTimeout(timer)
            if (err) reject(typeof err === 'string' ? new Error(err) : err)
            else resolve(result)
        }

        ws.send(jss.stringify({ type, data, queryId, createdAt }))
    })
}

function setOnReceiver(type, handler) {
    if (type === null) receiverArray.push(handler)
    else {
        if (!ofTypesOb[type]) ofTypesOb[type] = []
        ofTypesOb[type].push(handler)
    }
}

function connect(host, port) {
    if (typeof host === 'string' && typeof port === 'number') {
        serverUrl = `ws://${host}:${port}/api/ape`
    }
    if (!serverUrl) return

    if (ws && ws.readyState !== WebSocket.CLOSED) return
    notifyConnectionChange(ConnectionState.Connecting)
    ws = new WebSocket(serverUrl)

    ws.onopen = () => {
        ready = true
        notifyConnectionChange(ConnectionState.Connected)
        bufferedReceivers.forEach(({ type, handler }) => setOnReceiver(type, handler))
        bufferedReceivers = []
        bufferedCalls.forEach(({ type, data, resolve, reject, createdAt, timer }) => {
            clearTimeout(timer)
            send(type, data, createdAt).then(resolve).catch(reject)
        })
        bufferedCalls = []
    }

    ws.onmessage = (event) => {
        const msg = jss.parse(typeof event.data === 'string' ? event.data : event.data.toString())
        const { err, type, queryId, data } = msg
        if (queryId && waitingOn[queryId]) {
            waitingOn[queryId](err, data)
            delete waitingOn[queryId]
            return
        }
        if (ofTypesOb[type]) ofTypesOb[type].forEach(h => h({ err, type, data }))
        receiverArray.forEach(h => h({ err, type, data }))
    }

    ws.onerror = (err) => console.error('🦍 api-ape client error:', err.message || err)

    ws.onclose = () => {
        ready = false
        ws = null
        notifyConnectionChange(ConnectionState.Disconnected)
        if (reconnectEnabled && serverUrl) reconnectTimer = setTimeout(() => connect(), 1000)
    }
}

function close() {
    reconnectEnabled = false
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (ws) { notifyConnectionChange(ConnectionState.Closing); ws.close() }
}

function queueOrSend(type, data) {
    if (ready && ws && ws.readyState === WebSocket.OPEN) return send(type, data)
    return new Promise((resolve, reject) => {
        const createdAt = Date.now()
        const timer = setTimeout(() => {
            const idx = bufferedCalls.findIndex(m => m.createdAt === createdAt)
            if (idx > -1) bufferedCalls.splice(idx, 1)
            reject(new Error(`Connection timeout: ${type}`))
        }, connectTimeout)
        bufferedCalls.push({ type, data, resolve, reject, createdAt, timer })
        if (connectionState === ConnectionState.Disconnected && serverUrl) connect()
    })
}

function on(type, handler) {
    if (typeof type === 'function') { handler = type; type = null }
    if (ready) setOnReceiver(type, handler)
    else { bufferedReceivers.push({ type, handler }); if (serverUrl) connect() }
}

function onConnectionChange(handler) {
    connectionChangeListeners.push(handler)
    handler(connectionState)
    return () => {
        const idx = connectionChangeListeners.indexOf(handler)
        if (idx > -1) connectionChangeListeners.splice(idx, 1)
    }
}

function isReady() { return ready }
function getWs() { return ws }

module.exports = {
    ConnectionState, connect, close, send, queueOrSend, on, onConnectionChange,
    setOnReceiver, notifyConnectionChange, isReady, getWs, WebSocket
}
