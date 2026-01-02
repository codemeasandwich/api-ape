/**
 * api-ape client singleton
 * Initializes once and is ready for use throughout the app
 */

let apeClient = null
let isConnecting = false
let connectionPromise = null

/**
 * Get the api-ape client - initializes on first call
 */
export async function getApeClient() {
    if (apeClient) {
        return apeClient
    }

    if (isConnecting) {
        return connectionPromise
    }

    isConnecting = true
    connectionPromise = initClient()

    try {
        apeClient = await connectionPromise
        return apeClient
    } finally {
        isConnecting = false
    }
}

/**
 * Initialize the api-ape client
 */
async function initClient() {
    if (typeof window === 'undefined') {
        return null
    }

    const module = await import('api-ape/client/connectSocket')
    const connectSocket = module.default

    // Configure for current port
    const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80)
    connectSocket.configure({ port: parseInt(port, 10) })

    // Connect and get sender/receiver
    const { sender, setOnReciver } = connectSocket()

    // Enable auto-reconnect
    connectSocket.autoReconnect()

    console.log('🦍 api-ape client initialized')

    return { sender, setOnReciver, connectSocket }
}

/**
 * Check if client is connected
 */
export function isConnected() {
    return apeClient !== null
}

export default getApeClient
