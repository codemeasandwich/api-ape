/**
 * Network detection and captive portal checks
 * @module client/connection/network
 */

import { ConnectionState, notifyConnectionChange } from './state'

const PING_TIMEOUT = 3000        // Timeout for ping check
const MAX_PING_CLOCK_SKEW = 60000 // Max allowed time difference (60s)
export const WS_RETRY_INTERVAL = 30000  // Retry interval for network/WS

let networkCheckTimer = null

/**
 * Check if running in dev/local mode
 * @returns {boolean} True if running on localhost
 */
export function isDevMode() {
    if (typeof window === 'undefined') return false
    return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
}

/**
 * Build ping URL for captive portal detection
 * @returns {string} Full URL to the ping endpoint
 */
export function getPingUrl() {
    const hostname = window.location.hostname
    const isHttps = window.location.protocol === 'https:'
    const port = window.location.port || (isHttps ? 443 : 80)
    const protocol = isHttps ? 'https' : 'http'
    const portSuffix = (port !== 80 && port !== 443) ? `:${port}` : ''
    return `${protocol}://${hostname}${portSuffix}/api/ape/ping`
}

/**
 * Check for captive portal by pinging /api/ape/ping
 * @returns {Promise<'ok'|'walled'>} 'ok' if real internet, 'walled' if captive portal detected
 */
export async function checkCaptivePortal() {
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT)

        const response = await fetch(getPingUrl(), {
            cache: 'no-store',
            signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
            if (isDevMode()) {
                console.error('🦍 [DEV] Ping failed: HTTP', response.status)
            }
            return 'walled'
        }

        const data = await response.json()

        // Verify response is genuine (not a captive portal redirect page)
        if (data?.ok !== true) {
            if (isDevMode()) {
                console.error('🦍 [DEV] Ping failed: invalid response', data)
            }
            return 'walled'
        }

        // Validate timestamp to detect proxy replay attacks
        if (typeof data.ts === 'number') {
            const now = Date.now()
            const skew = Math.abs(now - data.ts)
            if (skew > MAX_PING_CLOCK_SKEW) {
                if (isDevMode()) {
                    console.error('🦍 [DEV] Ping failed: timestamp too old/stale (skew:', skew, 'ms)')
                }
                return 'walled'
            }
        }

        return 'ok'
    } catch (err) {
        if (isDevMode()) {
            console.error('🦍 [DEV] Ping failed:', err.message || err)
        }
        return 'walled'
    }
}

/**
 * Schedule a retry of network check (for walled/offline states)
 * @param {Function} attemptConnectionFn - Function to call for connection attempt
 * @returns {void}
 */
export function scheduleNetworkRetry(attemptConnectionFn) {
    if (networkCheckTimer) return
    networkCheckTimer = setTimeout(() => {
        networkCheckTimer = null
        attemptConnectionFn()
    }, WS_RETRY_INTERVAL)
}

/**
 * Setup navigator.onLine event listeners for offline/online detection
 * @param {Function} attemptConnectionFn - Function to call when online
 * @returns {void}
 */
export function setupOnlineListeners(attemptConnectionFn) {
    if (typeof window === 'undefined') return

    window.addEventListener('online', () => {
        console.log('🦍 Browser went online, checking network...')
        attemptConnectionFn()
    })

    window.addEventListener('offline', () => {
        console.log('🦍 Browser went offline')
        notifyConnectionChange(ConnectionState.Offline)
    })
}

/**
 * Get base URL for API endpoints
 * @returns {string} Base URL (e.g., 'https://example.com:443')
 */
export function getBaseUrl() {
    const hostname = window.location.hostname
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
    const isHttps = window.location.protocol === "https:"
    const port = window.location.port || (isLocal ? 9010 : (isHttps ? 443 : 80))
    const protocol = isHttps ? "https" : "http"
    const portSuffix = (port !== 80 && port !== 443) ? `:${port}` : ""
    return `${protocol}://${hostname}${portSuffix}`
}

/**
 * Get WebSocket URL - auto-detects from window.location
 * @returns {string} WebSocket URL (ws:// or wss://)
 */
export function getSocketUrl() {
    const hostname = window.location.hostname
    const localServers = ["localhost", "127.0.0.1", "[::1]"]
    const isLocal = localServers.includes(hostname)
    const isHttps = window.location.protocol === "https:"
    const port = window.location.port || (isLocal ? 9010 : (isHttps ? 443 : 80))
    const protocol = isHttps ? "wss" : "ws"
    const portSuffix = (port !== 80 && port !== 443) ? `:${port}` : ""
    return `${protocol}://${hostname}${portSuffix}/api/ape`
}
