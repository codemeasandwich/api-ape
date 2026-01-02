import connectSocket from './connectSocket.js'

// Auto-configure for current page
const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80)
connectSocket.configure({ port: parseInt(port, 10) })

const { sender, setOnReciver } = connectSocket()
connectSocket.autoReconnect()

// Global API - use defineProperty to bypass Proxy interception
window.ape = sender
Object.defineProperty(window.ape, 'on', {
    value: setOnReciver,
    writable: false,
    enumerable: false,
    configurable: false
})
