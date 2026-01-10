/**
 * HTTP Streaming transport for api-ape
 * Fallback when WebSocket is blocked - uses fetch + ReadableStream for receiving, POST for sending
 * @module client/transports/streaming
 */

import jss from '../../utils/jss'
import { parseStreamBuffer } from './streamParser'

function getPollUrl() {
    const hostname = window.location.hostname
    const localServers = ["localhost", "127.0.0.1", "[::1]"]
    const isLocal = localServers.includes(hostname)
    const isHttps = window.location.protocol === "https:"
    const port = window.location.port || (isLocal ? 9010 : (isHttps ? 443 : 80))
    const protocol = isHttps ? "https" : "http"
    const portSuffix = (port !== 80 && port !== 443) ? `:${port}` : ""
    return `${protocol}://${hostname}${portSuffix}/api/ape/poll`
}

function createStreamingTransport() {
    let isActive = false
    let abortController = null
    let streamBuffer = ''
    let reconnectTimer = null
    let onMessage = () => { }
    let onOpen = () => { }
    let onClose = () => { }
    let onError = () => { }

    function scheduleReconnect() {
        if (!isActive) return
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(() => { if (isActive) connect() }, 500)
    }

    async function connect() {
        if (isActive) return
        isActive = true
        abortController = new AbortController()

        try {
            const response = await fetch(getPollUrl(), {
                method: 'GET',
                credentials: 'include',
                signal: abortController.signal,
                headers: { 'Accept': 'application/json' }
            })

            if (!response.ok) throw new Error(`Stream connect failed: ${response.status}`)

            onOpen()

            const reader = response.body.getReader()
            const decoder = new TextDecoder()

            async function read() {
                while (isActive) {
                    try {
                        const { done, value } = await reader.read()
                        if (done) { scheduleReconnect(); return }

                        streamBuffer += decoder.decode(value, { stream: true })
                        const { messages, remaining } = parseStreamBuffer(streamBuffer)
                        streamBuffer = remaining

                        for (const msg of messages) {
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

    async function send(type, data, createdAt) {
        const payload = { type, data, createdAt: new Date(createdAt) }
        const response = await fetch(getPollUrl(), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: jss.stringify(payload)
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(error.error || `Request failed: ${response.status}`)
        }

        return jss.parse(await response.text()).data
    }

    function close() {
        isActive = false
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
        if (abortController) { abortController.abort(); abortController = null }
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
