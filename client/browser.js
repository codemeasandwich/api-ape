import connectSocket from './connectSocket.js'

const { sender, setOnReceiver, onConnectionChange, getTransport } = connectSocket()
connectSocket.autoReconnect()

// Global API - use defineProperty to bypass Proxy interception
window.api = sender
Object.defineProperty(window.api, 'on', {
    value: setOnReceiver,
    writable: false,
    enumerable: false,
    configurable: false
})
Object.defineProperty(window.api, 'onConnectionChange', {
    value: onConnectionChange,
    writable: false,
    enumerable: false,
    configurable: false
})
Object.defineProperty(window.api, 'getTransport', {
    value: getTransport,
    writable: false,
    enumerable: false,
    configurable: false
})
