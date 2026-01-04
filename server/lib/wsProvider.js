/**
 * WebSocket Provider
 * Detects runtime capabilities and provides appropriate WebSocket implementation
 * 
 * Priority:
 * 1. Node.js 24+ stable native WebSocketServer (node:ws module)
 * 2. Custom polyfill (RFC 6455 compliant)
 */

/**
 * Check if Node.js version is 24+ stable (not pre-release)
 * @returns {boolean}
 */
function isNode24Stable() {
    if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
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
 * Get WebSocket provider based on runtime capabilities
 * @returns {{ type: string, WebSocketServer: typeof import('./ws').WebSocketServer }}
 */
function getWebSocketProvider() {
    // 1. Try Node.js 24+ native WebSocketServer
    if (isNode24Stable()) {
        try {
            const { WebSocketServer } = require('node:ws')
            if (WebSocketServer) {
                return { type: 'node-native', WebSocketServer }
            }
        } catch {
            // node:ws not available, fall through
        }
    }

    // 2. Fall back to our polyfill
    const { WebSocketServer } = require('./ws/index')
    return { type: 'polyfill', WebSocketServer }
}

// Cache the provider for consistent usage
let cachedProvider = null

/**
 * Get cached WebSocket provider
 * @returns {{ type: string, WebSocketServer: typeof import('./ws').WebSocketServer }}
 */
function getCachedProvider() {
    if (!cachedProvider) {
        cachedProvider = getWebSocketProvider()
    }
    return cachedProvider
}

module.exports = {
    getWebSocketProvider: getCachedProvider,
    isNode24Stable
}
