import connectSocket from './connectSocket.js'

// Auto-configure for current page
const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80)
connectSocket.configure({ port: parseInt(port, 10) })

const { sender, setOnReciver, onConnectionChange, getTransport } = connectSocket()
connectSocket.autoReconnect()

// Global API - use defineProperty to bypass Proxy interception
window.ape = sender
Object.defineProperty(window.ape, 'on', {
    value: setOnReciver,
    writable: false,
    enumerable: false,
    configurable: false
})
Object.defineProperty(window.ape, 'onConnectionChange', {
    value: onConnectionChange,
    writable: false,
    enumerable: false,
    configurable: false
})
Object.defineProperty(window.ape, 'configure', {
    value: connectSocket.configure,
    writable: false,
    enumerable: false,
    configurable: false
})
Object.defineProperty(window.ape, 'getTransport', {
    value: getTransport,
    writable: false,
    enumerable: false,
    configurable: false
})
