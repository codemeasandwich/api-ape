/**
 * api-ape Node.js client
 * 
 * Mirrors the browser client API exactly - same usage on server and browser.
 * 
 * Usage (identical to browser):
 *   import api from 'api-ape'
 *   
 *   api.message({ user: 'Bob', text: 'Hello!' })
 *   api.on('message', (data) => console.log(data))
 *   api.onConnectionChange((state) => console.log(state))
 * 
 * Configuration:
 *   Set APE_SERVER environment variable to the WebSocket URL:
 *   APE_SERVER=ws://other-server:3000/api/ape node app.js
 * 
 *   Or call api.connect(url) before first use
 */

const jss = require('../utils/jss')
const { WebSocket: WsPolyfill } = require('./lib/ws')

// Use native WebSocket if available (Node 22+), otherwise use polyfill
const WebSocket = globalThis.WebSocket || WsPolyfill

// Connection state enum
const ConnectionState = {
    Disconnected: 'disconnected',
    Connecting: 'connecting',
    Connected: 'connected',
    Closing: 'closing'
}

// Shared state (mirrors browser client)
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

const joinKey = '/'
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

function connect(url) {
    if (url) serverUrl = url

    if (!serverUrl) {
        console.warn('🦍 api-ape: No server URL configured. Set APE_SERVER env or call api.connect(url)')
        return
    }

    if (ws && ws.readyState !== WebSocket.CLOSED) {
        return
    }

    notifyConnectionChange(ConnectionState.Connecting)

    ws = new WebSocket(serverUrl)

    ws.onopen = () => {
        ready = true
        notifyConnectionChange(ConnectionState.Connected)

        // Flush buffered receivers
        bufferedReceivers.forEach(({ type, handler }) => {
            setOnReceiver(type, handler)
        })
        bufferedReceivers = []

        // Flush buffered calls
        bufferedCalls.forEach(({ type, data, resolve, reject, createdAt, timer }) => {
            clearTimeout(timer)
            send(type, data, createdAt).then(resolve).catch(reject)
        })
        bufferedCalls = []
    }

    ws.onmessage = (event) => {
        const msg = jss.parse(typeof event.data === 'string' ? event.data : event.data.toString())
        const { err, type, queryId, data } = msg

        // Response to a query
        if (queryId && waitingOn[queryId]) {
            waitingOn[queryId](err, data)
            delete waitingOn[queryId]
            return
        }

        // Broadcast message
        if (ofTypesOb[type]) {
            ofTypesOb[type].forEach(handler => handler({ err, type, data }))
        }
        receiverArray.forEach(handler => handler({ err, type, data }))
    }

    ws.onerror = (err) => {
        console.error('🦍 api-ape client error:', err.message || err)
    }

    ws.onclose = () => {
        ready = false
        ws = null
        notifyConnectionChange(ConnectionState.Disconnected)

        if (reconnectEnabled && serverUrl) {
            reconnectTimer = setTimeout(() => connect(), 1000)
        }
    }
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
            if (err) {
                reject(typeof err === 'string' ? new Error(err) : err)
            } else {
                resolve(result)
            }
        }

        const message = jss.stringify({ type, data, queryId, createdAt })
        ws.send(message)
    })
}

function queueOrSend(type, data) {
    if (ready && ws && ws.readyState === WebSocket.OPEN) {
        return send(type, data)
    }

    // Queue the message
    return new Promise((resolve, reject) => {
        const createdAt = Date.now()
        const timer = setTimeout(() => {
            const idx = bufferedCalls.findIndex(m => m.createdAt === createdAt)
            if (idx > -1) bufferedCalls.splice(idx, 1)
            reject(new Error(`Connection timeout: ${type}`))
        }, connectTimeout)

        bufferedCalls.push({ type, data, resolve, reject, createdAt, timer })

        // Ensure we're connecting
        if (connectionState === ConnectionState.Disconnected && serverUrl) {
            connect()
        }
    })
}

/**
 * Subscribe to broadcasts from the server (same as browser api.on)
 */
function on(type, handler) {
    if (typeof type === 'function') {
        handler = type
        type = null
    }

    if (ready) {
        setOnReceiver(type, handler)
    } else {
        bufferedReceivers.push({ type, handler })
        if (serverUrl) connect()
    }
}

function setOnReceiver(type, handler) {
    if (type === null) {
        receiverArray.push(handler)
    } else {
        if (!ofTypesOb[type]) ofTypesOb[type] = []
        ofTypesOb[type].push(handler)
    }
}

/**
 * Subscribe to connection state changes (same as browser api.onConnectionChange)
 */
function onConnectionChange(handler) {
    connectionChangeListeners.push(handler)
    handler(connectionState)
    return () => {
        const idx = connectionChangeListeners.indexOf(handler)
        if (idx > -1) connectionChangeListeners.splice(idx, 1)
    }
}

/**
 * Create the sender proxy (mirrors browser client exactly)
 */
const handler = {
    get(target, prop) {
        // Reserved properties - same as browser
        if (prop === 'on') return on
        if (prop === 'onConnectionChange') return onConnectionChange
        if (prop === 'transport') return ready ? 'websocket' : null
        if (prop === 'connect') return connect
        if (prop === 'close') return close
        if (prop === 'then' || prop === 'catch') return undefined // Not a Promise

        // Return a function that either calls directly or buffers
        const wrapperFn = function (a, b) {
            let path = joinKey + prop, body
            if (arguments.length === 2) {
                path += a
                body = b
            } else {
                body = a
            }
            return queueOrSend(path, body)
        }
        return new Proxy(wrapperFn, handler)
    }
}

function close() {
    reconnectEnabled = false
    if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
    }
    if (ws) {
        notifyConnectionChange(ConnectionState.Closing)
        ws.close()
    }
}

// Create the proxy (same interface as browser senderProxy)
const api = new Proxy({}, handler)

// Define properties on the proxy (same as browser)
Object.defineProperty(api, 'on', {
    value: on,
    writable: false,
    enumerable: false,
    configurable: false
})

Object.defineProperty(api, 'onConnectionChange', {
    value: onConnectionChange,
    writable: false,
    enumerable: false,
    configurable: false
})

Object.defineProperty(api, 'connect', {
    value: connect,
    writable: false,
    enumerable: false,
    configurable: false
})

Object.defineProperty(api, 'close', {
    value: close,
    writable: false,
    enumerable: false,
    configurable: false
})

// Auto-connect if APE_SERVER is set
if (serverUrl) {
    connect()
}

// Export the same interface as browser
module.exports = api
module.exports.default = api
module.exports.on = on
module.exports.onConnectionChange = onConnectionChange
module.exports.connect = connect
module.exports.close = close
module.exports.ConnectionState = ConnectionState
