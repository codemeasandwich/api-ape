/**
 * Unified api-ape export for browser
 * 
 * Auto-detects browser environment, initializes client, and buffers
 * calls until the connection is ready. No more getApeClient().then()!
 * 
 * Usage:
 *   import api from 'api-ape'
 *   
 *   // Properties are proxied - calls buffer until connected
 *   api.message({ user: 'Bob', text: 'Hello!' })
 *   
 *   // Subscribe to broadcasts
 *   api.on('message', (data) => console.log(data))
 *   
 *   // Check connection state
 *   api.onConnectionChange((state) => console.log(state))
 */

// Only run this in browser environments
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

let clientPromise = null
let resolvedClient = null
const bufferedCalls = []
const bufferedReceivers = []
const connectionChangeHandlers = []
let currentConnectionState = 'disconnected'

/**
 * Initialize the client (called once on first use)
 */
function getClient() {
    if (clientPromise) return clientPromise

    if (!isBrowser) {
        // Return a dummy object for SSR
        return Promise.resolve(null)
    }

    clientPromise = (async () => {
        const connectSocket = (await import('./connectSocket.js')).default

        // Connect
        const client = connectSocket()
        connectSocket.autoReconnect()

        // Track connection state
        client.onConnectionChange((state) => {
            currentConnectionState = state
            connectionChangeHandlers.forEach(fn => fn(state))
        })

        resolvedClient = client

        // Flush buffered receivers
        bufferedReceivers.forEach(({ type, handler }) => {
            client.setOnReciver(type, handler)
        })
        bufferedReceivers.length = 0

        // Flush buffered calls
        bufferedCalls.forEach(({ method, args, resolve, reject }) => {
            try {
                const result = client.sender[method](...args)
                if (result && typeof result.then === 'function') {
                    result.then(resolve).catch(reject)
                } else {
                    resolve(result)
                }
            } catch (err) {
                reject(err)
            }
        })
        bufferedCalls.length = 0

        return client
    })()

    return clientPromise
}

/**
 * Create a sender proxy that buffers calls until client is ready
 */
const senderProxy = new Proxy({}, {
    get(target, prop) {
        // Reserved properties
        if (prop === 'on') return on
        if (prop === 'onConnectionChange') return onConnectionChange
        if (prop === 'getTransport') return () => resolvedClient?.getTransport?.() || null
        if (prop === 'then' || prop === 'catch') return undefined // Not a Promise

        // Return a function that either calls directly or buffers
        return (...args) => {
            // If client is ready, call directly
            if (resolvedClient) {
                return resolvedClient.sender[prop](...args)
            }

            // Buffer the call and return a Promise
            return new Promise((resolve, reject) => {
                bufferedCalls.push({ method: prop, args, resolve, reject })
                // Ensure client is initializing
                getClient()
            })
        }
    }
})

/**
 * Subscribe to broadcasts from the server
 * @param {string} type - Broadcast type to listen for
 * @param {Function} handler - Handler function
 */
function on(type, handler) {
    if (resolvedClient) {
        resolvedClient.setOnReciver(type, handler)
    } else {
        bufferedReceivers.push({ type, handler })
        getClient()
    }
}

/**
 * Subscribe to connection state changes
 * @param {Function} handler - Called with state: 'offline' | 'walled' | 'disconnected' | 'connecting' | 'connected'
 * @returns {Function} Unsubscribe function
 */
function onConnectionChange(handler) {
    connectionChangeHandlers.push(handler)
    // Immediately call with current state
    handler(currentConnectionState)

    // If client exists, also register with it
    if (resolvedClient) {
        return resolvedClient.onConnectionChange(handler)
    }

    // Ensure client is initializing
    getClient()

    // Return unsubscribe function
    return () => {
        const idx = connectionChangeHandlers.indexOf(handler)
        if (idx > -1) connectionChangeHandlers.splice(idx, 1)
    }
}

// Define properties on the proxy to avoid Proxy interception issues
Object.defineProperty(senderProxy, 'on', {
    value: on,
    writable: false,
    enumerable: false,
    configurable: false
})

Object.defineProperty(senderProxy, 'onConnectionChange', {
    value: onConnectionChange,
    writable: false,
    enumerable: false,
    configurable: false
})

// Auto-initialize in browser
if (isBrowser) {
    getClient()
}

export default senderProxy
export { on, onConnectionChange, getClient }
