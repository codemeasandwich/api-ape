/**
 * @fileoverview Connection State Management for api-ape Client
 *
 * This module manages WebSocket/HTTP connection state and provides
 * a subscription mechanism for components to react to state changes.
 *
 * ## Connection States
 *
 * The connection lifecycle follows these states:
 *
 * ```
 *                    ┌─────────────┐
 *                    │   offline   │ (navigator.onLine = false)
 *                    └──────┬──────┘
 *                           │ browser goes online
 *                           ▼
 *   ┌────────────┐    ┌─────────────┐
 *   │   walled   │◄───│ connecting  │
 *   │  (captive  │    └──────┬──────┘
 *   │  portal)   │           │ connection succeeds
 *   └────────────┘           ▼
 *                    ┌─────────────┐
 *                    │  connected  │
 *                    └──────┬──────┘
 *                           │ connection lost
 *                           ▼
 *                    ┌─────────────┐
 *                    │disconnected │──► (retry connecting)
 *                    └─────────────┘
 * ```
 *
 * ## Usage
 *
 * Internal modules use `notifyConnectionChange()` to update state.
 * External code uses `onConnectionChange()` to subscribe to changes.
 *
 * @module client/connection/state
 * @author api-ape
 *
 * @example
 * // Subscribe to connection changes
 * import { onConnectionChange, ConnectionState } from './state'
 *
 * const unsubscribe = onConnectionChange((state) => {
 *   if (state === ConnectionState.Connected) {
 *     console.log('✅ Connected to server')
 *   } else if (state === ConnectionState.Offline) {
 *     console.log('📵 Device is offline')
 *   }
 * })
 *
 * // Later: stop listening
 * unsubscribe()
 *
 * @example
 * // Internal usage - updating state
 * import { notifyConnectionChange, ConnectionState } from './state'
 *
 * notifyConnectionChange(ConnectionState.Connecting)
 * // ... attempt connection ...
 * notifyConnectionChange(ConnectionState.Connected)
 */

/**
 * Valid connection state string values
 *
 * @typedef {'offline'|'walled'|'disconnected'|'connecting'|'connected'|'closing'} ConnectionStateValue
 */

/**
 * Connection state enumeration
 *
 * Provides named constants for all possible connection states.
 * Use these constants instead of string literals for type safety.
 *
 * @readonly
 * @enum {ConnectionStateValue}
 *
 * @property {string} Offline - Browser's navigator.onLine reports false.
 *                              The device has no network connectivity.
 * @property {string} Walled - Captive portal detected (e.g., hotel/airport WiFi).
 *                             The ping endpoint returned an unexpected response,
 *                             indicating network traffic is being intercepted.
 * @property {string} Disconnected - Not currently connected to the server.
 *                                   This is the default state before first connection
 *                                   and after a connection is lost.
 * @property {string} Connecting - Actively attempting to establish a connection.
 *                                 WebSocket handshake or HTTP streaming setup in progress.
 * @property {string} Connected - Successfully connected and ready to send/receive messages.
 * @property {string} Closing - Connection is being gracefully closed.
 *                              No new messages will be sent.
 *
 * @example
 * import { ConnectionState } from './state'
 *
 * function handleState(state) {
 *   switch (state) {
 *     case ConnectionState.Offline:
 *       showOfflineIndicator()
 *       break
 *     case ConnectionState.Walled:
 *       showCaptivePortalWarning()
 *       break
 *     case ConnectionState.Connected:
 *       hideConnectionWarnings()
 *       enableUI()
 *       break
 *     case ConnectionState.Disconnected:
 *       showReconnectingIndicator()
 *       break
 *   }
 * }
 */
export const ConnectionState = {
  /**
   * Browser's navigator.onLine is false - no network connectivity
   * @type {ConnectionStateValue}
   */
  Offline: "offline",

  /**
   * Captive portal detected - network is intercepting traffic
   * @type {ConnectionStateValue}
   */
  Walled: "walled",

  /**
   * Not connected - either initial state or connection was lost
   * @type {ConnectionStateValue}
   */
  Disconnected: "disconnected",

  /**
   * Connection attempt in progress
   * @type {ConnectionStateValue}
   */
  Connecting: "connecting",

  /**
   * Successfully connected and ready for communication
   * @type {ConnectionStateValue}
   */
  Connected: "connected",

  /**
   * Connection is being gracefully closed
   * @type {ConnectionStateValue}
   */
  Closing: "closing",
};

/**
 * Current connection state
 *
 * Initialized based on navigator.onLine status if available,
 * otherwise defaults to 'disconnected'.
 *
 * @type {ConnectionStateValue}
 * @private
 */
let connectionState =
  typeof navigator !== "undefined" && !navigator.onLine
    ? ConnectionState.Offline
    : ConnectionState.Disconnected;

/**
 * Array of registered connection change listener functions
 *
 * Each listener is called with the new state whenever it changes.
 *
 * @type {Array<function(ConnectionStateValue): void>}
 * @private
 */
const connectionChangeListeners = [];

/**
 * Update the connection state and notify all listeners
 *
 * This function is called internally by connection management code
 * (connectSocket, network utilities) when the connection state changes.
 * It only notifies listeners if the state actually changed.
 *
 * @param {ConnectionStateValue} newState - The new connection state
 * @returns {void}
 *
 * @example
 * // Internal usage in connectSocket.js
 * import { notifyConnectionChange, ConnectionState } from './state'
 *
 * // When WebSocket opens
 * ws.onopen = () => {
 *   notifyConnectionChange(ConnectionState.Connected)
 * }
 *
 * // When WebSocket closes
 * ws.onclose = () => {
 *   notifyConnectionChange(ConnectionState.Disconnected)
 * }
 *
 * @example
 * // Detecting captive portal
 * if (await checkCaptivePortal() === 'walled') {
 *   notifyConnectionChange(ConnectionState.Walled)
 * }
 */
export function notifyConnectionChange(newState) {
  if (connectionState !== newState) {
    connectionState = newState;
    connectionChangeListeners.forEach((fn) => fn(newState));
  }
}

/**
 * Get the current connection state
 *
 * Returns the current state without subscribing to changes.
 * For reactive updates, use `onConnectionChange()` instead.
 *
 * @returns {ConnectionStateValue} The current connection state
 *
 * @example
 * import { getConnectionState, ConnectionState } from './state'
 *
 * if (getConnectionState() === ConnectionState.Connected) {
 *   sendMessage({ text: 'Hello!' })
 * } else {
 *   queueMessage({ text: 'Hello!' })
 * }
 *
 * @example
 * // Check if online before making request
 * function canSendMessage() {
 *   const state = getConnectionState()
 *   return state === ConnectionState.Connected
 * }
 */
export function getConnectionState() {
  return connectionState;
}

/**
 * Subscribe to connection state changes
 *
 * Registers a handler function that will be called whenever the
 * connection state changes. The handler is immediately invoked
 * with the current state upon registration.
 *
 * @param {function(ConnectionStateValue): void} handler - Callback function
 *        that receives the new state value whenever it changes
 * @returns {function(): void} Unsubscribe function - call this to remove
 *          the handler and stop receiving updates
 *
 * @example
 * // Basic usage with cleanup
 * import { onConnectionChange } from './state'
 *
 * const unsubscribe = onConnectionChange((state) => {
 *   console.log('Connection state:', state)
 * })
 *
 * // When component unmounts or cleanup needed:
 * unsubscribe()
 *
 * @example
 * // React component integration
 * function useConnectionState() {
 *   const [state, setState] = useState('disconnected')
 *
 *   useEffect(() => {
 *     const unsubscribe = onConnectionChange(setState)
 *     return unsubscribe
 *   }, [])
 *
 *   return state
 * }
 *
 * @example
 * // Show/hide UI elements based on state
 * onConnectionChange((state) => {
 *   const offlineBanner = document.getElementById('offline-banner')
 *   const sendButton = document.getElementById('send-btn')
 *
 *   switch (state) {
 *     case 'connected':
 *       offlineBanner.hidden = true
 *       sendButton.disabled = false
 *       break
 *     case 'offline':
 *     case 'walled':
 *       offlineBanner.hidden = false
 *       sendButton.disabled = true
 *       break
 *     case 'connecting':
 *       offlineBanner.textContent = 'Reconnecting...'
 *       offlineBanner.hidden = false
 *       break
 *   }
 * })
 *
 * @example
 * // Logging connection events
 * onConnectionChange((state) => {
 *   const timestamp = new Date().toISOString()
 *   console.log(`[${timestamp}] Connection: ${state}`)
 *
 *   // Send to analytics
 *   analytics.track('connection_state_change', { state, timestamp })
 * })
 */
export function onConnectionChange(handler) {
  connectionChangeListeners.push(handler);

  // Immediately call with current state so subscriber knows initial state
  handler(connectionState);

  // Return unsubscribe function
  return () => {
    const idx = connectionChangeListeners.indexOf(handler);
    if (idx > -1) connectionChangeListeners.splice(idx, 1);
  };
}
