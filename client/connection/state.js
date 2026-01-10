/**
 * Connection state management
 * Tracks connection state and notifies listeners of changes
 * @module client/connection/state
 */

/**
 * @typedef {'offline'|'walled'|'disconnected'|'connecting'|'connected'|'closing'} ConnectionStateValue
 */

/**
 * Connection state enum
 * @enum {ConnectionStateValue}
 */
export const ConnectionState = {
    /** navigator.onLine = false */
    Offline: 'offline',
    /** Captive portal detected (ping failed) */
    Walled: 'walled',
    Disconnected: 'disconnected',
    Connecting: 'connecting',
    Connected: 'connected',
    Closing: 'closing'
}

// Connection state tracking - start with offline check
let connectionState = (typeof navigator !== 'undefined' && !navigator.onLine)
    ? ConnectionState.Offline
    : ConnectionState.Disconnected

const connectionChangeListeners = []

/**
 * Notify all listeners of connection state change
 * @param {ConnectionStateValue} newState - The new connection state
 * @returns {void}
 */
export function notifyConnectionChange(newState) {
    if (connectionState !== newState) {
        connectionState = newState
        connectionChangeListeners.forEach(fn => fn(newState))
    }
}

/**
 * Get current connection state
 * @returns {ConnectionStateValue}
 */
export function getConnectionState() {
    return connectionState
}

/**
 * Subscribe to connection state changes
 * @param {Function} handler - Handler called with new state
 * @returns {Function} Unsubscribe function
 */
export function onConnectionChange(handler) {
    connectionChangeListeners.push(handler)
    // Immediately call with current state
    handler(connectionState)
    // Return unsubscribe function
    return () => {
        const idx = connectionChangeListeners.indexOf(handler)
        if (idx > -1) connectionChangeListeners.splice(idx, 1)
    }
}
