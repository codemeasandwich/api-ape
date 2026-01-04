/**
 * WebSocket Provider
 * Detects runtime capabilities and provides appropriate WebSocket implementation
 * 
 * Priority:
 * 1. Deno native WebSocket (Deno.upgradeWebSocket)
 * 2. Bun native WebSocket (Bun.serve websocket)
 * 3. Node.js 24+ stable native WebSocketServer (node:ws module)
 * 4. Custom polyfill (RFC 6455 compliant)
 */

/**
 * Check if running in Deno runtime
 * @returns {boolean}
 */
function isDeno() {
    return typeof Deno !== 'undefined' && typeof Deno.upgradeWebSocket === 'function'
}

/**
 * Check if running in Bun runtime
 * Uses process.versions.bun which is the recommended detection method
 * @returns {boolean}
 */
function isBun() {
    return typeof process !== 'undefined' && !!process.versions?.bun
}

/**
 * Check if Node.js version is 24+ stable (not pre-release)
 * @returns {boolean}
 */
function isNode24Stable() {
    if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
        return false
    }

    // Skip if this is actually Bun (Bun also has process.versions.node)
    if (isBun()) {
        return false
    }

    const versionStr = process.versions.node
    const majorVersion = parseInt(versionStr.split('.')[0], 10)

    // Must be Node 24+
    if (majorVersion < 24) {
        return false
    }

    // Check if this is a stable release (not RC, alpha, beta)
    // Pre-release versions contain hyphens like "24.0.0-rc.1"
    if (versionStr.includes('-')) {
        return false
    }

    return true
}

/**
 * Get the detected runtime type
 * @returns {'deno' | 'bun' | 'node' | 'unknown'}
 */
function getRuntime() {
    if (isDeno()) return 'deno'
    if (isBun()) return 'bun'
    if (typeof process !== 'undefined' && process.versions?.node) return 'node'
    return 'unknown'
}

/**
 * Get WebSocket provider based on runtime capabilities
 * @returns {{ type: string, WebSocketServer: typeof import('./ws').WebSocketServer, runtime: string }}
 */
function getWebSocketProvider() {
    const runtime = getRuntime()

    // 1. Check for Deno runtime
    if (runtime === 'deno') {
        try {
            const { DenoWebSocketServer } = require('./ws/adapters/deno')
            return { type: 'deno-native', WebSocketServer: DenoWebSocketServer, runtime }
        } catch {
            // Adapter not available, fall through to polyfill
        }
    }

    // 2. Check for Bun runtime
    if (runtime === 'bun') {
        try {
            const { BunWebSocketServer } = require('./ws/adapters/bun')
            return { type: 'bun-native', WebSocketServer: BunWebSocketServer, runtime }
        } catch {
            // Adapter not available, fall through to polyfill
        }
    }

    // 3. Try Node.js 24+ native WebSocketServer
    if (isNode24Stable()) {
        try {
            const { WebSocketServer } = require('node:ws')
            if (WebSocketServer) {
                return { type: 'node-native', WebSocketServer, runtime }
            }
        } catch {
            // node:ws not available, fall through
        }
    }

    // 4. Fall back to our polyfill
    const { WebSocketServer } = require('./ws/index')
    return { type: 'polyfill', WebSocketServer, runtime }
}

// Cache the provider for consistent usage
let cachedProvider = null

/**
 * Get cached WebSocket provider
 * @returns {{ type: string, WebSocketServer: typeof import('./ws').WebSocketServer, runtime: string }}
 */
function getCachedProvider() {
    if (!cachedProvider) {
        cachedProvider = getWebSocketProvider()
    }
    return cachedProvider
}

module.exports = {
    getWebSocketProvider: getCachedProvider,
    getRuntime,
    isDeno,
    isBun,
    isNode24Stable
}
