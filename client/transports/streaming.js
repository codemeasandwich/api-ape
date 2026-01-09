/**
 * HTTP Streaming transport for api-ape
 * Fallback when WebSocket is blocked - uses fetch + ReadableStream for receiving, POST for sending
 * @module client/transports/streaming
 */

import jss from '../../utils/jss'

/**
 * Get base URL for polling endpoints
 * @returns {string} Full URL to the polling endpoint
 */
function getPollUrl() {
    const hostname = window.location.hostname
    const localServers = ["localhost", "127.0.0.1", "[::1]"]
    const isLocal = localServers.includes(hostname)
    const isHttps = window.location.protocol === "https:"

    // Use window.location.port if available, otherwise fallback (9010 for local dev, 443/80 for prod)
    const port = window.location.port || (isLocal ? 9010 : (isHttps ? 443 : 80))

    const protocol = isHttps ? "https" : "http"
    const portSuffix = (port !== 80 && port !== 443) ? `:${port}` : ""

    return `${protocol}://${hostname}${portSuffix}/api/ape/poll`
}

/**
 * Parse JSON objects from a streaming buffer by counting braces
 * Handles strings containing braces correctly
 * @param {string} buffer - Raw streaming buffer content
 * @returns {{messages: Object[], remaining: string}} Parsed messages and remaining unparsed buffer
 */
function parseStreamBuffer(buffer) {
    const messages = []
    let start = -1
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i]

        if (escaped) {
            escaped = false
            continue
        }

        if (char === '\\' && inString) {
            escaped = true
            continue
        }

        if (char === '"') {
            inString = !inString
            continue
        }

        if (inString) continue

        if (char === '{') {
            if (depth === 0) {
                start = i
            }
            depth++
        } else if (char === '}') {
            depth--
            if (depth === 0 && start !== -1) {
                const jsonStr = buffer.slice(start, i + 1)
                try {
                    messages.push(jss.parse(jsonStr))
                } catch (e) {
                    console.error('🦍 Failed to parse stream message:', e)
                }
                start = -1
            }
        }
    }

    // Return remaining buffer (incomplete message)
    const remaining = start !== -1 ? buffer.slice(start) : ''
    return { messages, remaining }
}

/**
 * @typedef {Object} StreamingTransport
 * @property {Function} connect - Start the streaming connection
 * @property {Function} send - Send a message via POST
 * @property {Function} close - Close the streaming connection
 * @property {Function} isConnected - Check if transport is active
 * @property {Function} onMessage - Setter for message handler
 * @property {Function} onOpen - Setter for open handler
 * @property {Function} onClose - Setter for close handler
 * @property {Function} onError - Setter for error handler
 */

/**
 * Create streaming transport instance
 * @returns {StreamingTransport} Streaming transport interface
 */
function createStreamingTransport() {
    let isActive = false
    let abortController = null
    let streamBuffer = ''
    let reconnectTimer = null

    // Callbacks
    let onMessage = () => { }
    let onOpen = () => { }
    let onClose = () => { }
    let onError = () => { }

    /**
     * Start the streaming connection
     * @returns {Promise<void>}
     */
    async function connect() {
        if (isActive) return

        isActive = true
        abortController = new AbortController()

        try {
            const response = await fetch(getPollUrl(), {
                method: 'GET',
                credentials: 'include',
                signal: abortController.signal,
                headers: {
                    'Accept': 'application/json'
                }
            })

            if (!response.ok) {
                throw new Error(`Stream connect failed: ${response.status}`)
            }

            onOpen()

            const reader = response.body.getReader()
            const decoder = new TextDecoder()

            async function read() {
                while (isActive) {
                    try {
                        const { done, value } = await reader.read()

                        if (done) {
                            // Stream ended - reconnect
                            scheduleReconnect()
                            return
                        }

                        streamBuffer += decoder.decode(value, { stream: true })
                        const { messages, remaining } = parseStreamBuffer(streamBuffer)
                        streamBuffer = remaining

                        for (const msg of messages) {
                            // Skip heartbeat messages
                            if (msg.type === '__heartbeat__') continue
                            onMessage(msg)
                        }
                    } catch (readErr) {
                        if (readErr.name === 'AbortError') return
                        console.error('🦍 Stream read error:', readErr)
                        scheduleReconnect()
                        return
                    }
                }
            }

            read()

        } catch (err) {
            if (err.name === 'AbortError') return

            console.error('🦍 Stream connection error:', err)
            onError(err)
            scheduleReconnect()
        }
    }

    /**
     * Schedule reconnection with small delay
     * @returns {void}
     */
    function scheduleReconnect() {
        if (!isActive) return

        if (reconnectTimer) {
            clearTimeout(reconnectTimer)
        }

        reconnectTimer = setTimeout(() => {
            if (isActive) {
                connect()
            }
        }, 500)
    }

    /**
     * Send a message via POST
     * @param {string} type - Message type/path
     * @param {*} data - Message payload
     * @param {number} createdAt - Timestamp when message was created
     * @returns {Promise<*>} Server response data
     */
    async function send(type, data, createdAt) {
        const payload = {
            type,
            data,
            createdAt: new Date(createdAt)
        }

        const response = await fetch(getPollUrl(), {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: jss.stringify(payload)
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(error.error || `Request failed: ${response.status}`)
        }

        const result = jss.parse(await response.text())
        return result.data
    }

    /**
     * Close the streaming connection
     * @returns {void}
     */
    function close() {
        isActive = false

        if (reconnectTimer) {
            clearTimeout(reconnectTimer)
            reconnectTimer = null
        }

        if (abortController) {
            abortController.abort()
            abortController = null
        }

        streamBuffer = ''
        onClose()
    }

    return {
        connect,
        send,
        close,
        isConnected: () => isActive,
        set onMessage(fn) { onMessage = fn },
        set onOpen(fn) { onOpen = fn },
        set onClose(fn) { onClose = fn },
        set onError(fn) { onError = fn }
    }
}

export { createStreamingTransport, getPollUrl }
