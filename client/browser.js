import connectSocket from './connectSocket.js'

const client = connectSocket()
connectSocket.autoReconnect()

// Global API - use defineProperty to bypass Proxy interception
window.api = client.sender
Object.defineProperty(window.api, 'on', {
    value: client.setOnReceiver,
    writable: false,
    enumerable: false,
    configurable: false
})
Object.defineProperty(window.api, 'onConnectionChange', {
    value: client.onConnectionChange,
    writable: false,
    enumerable: false,
    configurable: false
})
// Read-only transport property - only ape can change this internally
Object.defineProperty(window.api, 'transport', {
    get: () => client.transport,
    enumerable: false,
    configurable: false
})
