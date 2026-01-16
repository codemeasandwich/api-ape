/**
 * @fileoverview Unified api-ape export for browser environments
 *
 * This module serves as the main entry point for browser-based api-ape clients.
 * It auto-detects browser environments, initializes the WebSocket connection,
 * and provides a proxy-based API that buffers calls until the connection is ready.
 *
 * @module client/index
 * @author api-ape
 *
 * @description
 * The module exports a Proxy object that intercepts property access and method calls,
 * allowing for a clean API syntax like `api.message({ text: 'Hello' })` while handling
 * connection state internally. Calls made before the connection is established are
 * automatically buffered and flushed once connected.
 *
 * ## Subscriptions (v2)
 *
 * Subscriptions use the same chaining syntax as RPC calls. The difference is
 * what you pass: **a function argument = subscription, data = RPC call**.
 *
 * For server-side rendering (SSR), the module returns a dummy object to prevent errors.
 *
 * @example
 * // Import the api-ape client
 * import api from 'api-ape'
 *
 * // RPC call - passing data
 * api.message({ user: 'Bob', text: 'Hello!' })
 *
 * // With path parameters
 * api.users('/123', { name: 'Updated Name' })
 *
 * // Subscribe to channels - passing a callback function
 * const unsub = api.news.banking(data => {
 *   console.log('Received:', data)
 * })
 *
 * // Unsubscribe when done
 * unsub()
 *
 * // Monitor connection state changes
 * api.onConnectionChange((state) => {
 *   console.log('Connection state:', state)
 * })
 *
 * @example
 * // Using async/await for responses
 * async function sendMessage() {
 *   try {
 *     const result = await api.chat({ message: 'Hello!' })
 *     console.log('Server response:', result)
 *   } catch (err) {
 *     console.error('Request failed:', err)
 *   }
 * }
 */

// Only run this in browser environments
const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

/**
 * Promise that resolves to the initialized client, or null for SSR
 * @type {Promise<Object|null>|null}
 * @private
 */
let clientPromise = null;

/**
 * The resolved client instance once initialization completes
 * @type {Object|null}
 * @private
 */
let resolvedClient = null;

/**
 * Buffer for API calls made before the client is ready
 * @type {Array<{method: string, args: any[], resolve: Function, reject: Function}>}
 * @private
 */
const bufferedCalls = [];

/**
 * Buffer for subscriptions registered before the client is ready
 * @type {Array<{channel: string, callback: Function, resolve: Function}>}
 * @private
 */
const bufferedSubscriptions = [];

/**
 * Registered connection state change handlers
 * @type {Array<Function>}
 * @private
 */
const connectionChangeHandlers = [];

/**
 * Current connection state value
 * @type {import('./connection/state').ConnectionStateValue}
 * @private
 */
let currentConnectionState = "disconnected";

/**
 * Initialize the api-ape client (called once on first use)
 *
 * This function lazily initializes the WebSocket client when first accessed.
 * It handles the asynchronous import of the connectSocket module and sets up
 * the connection with auto-reconnect enabled.
 *
 * @returns {Promise<Object|null>} Promise resolving to the client interface,
 *                                  or null when running in SSR/non-browser environment
 * @private
 *
 * @example
 * // Internal usage - normally called automatically
 * const client = await getClient()
 * if (client) {
 *   client.sender.myEndpoint({ data: 'value' })
 * }
 */
function getClient() {
  if (clientPromise) return clientPromise;

  if (!isBrowser) {
    // Return a dummy object for SSR
    return Promise.resolve(null);
  }

  clientPromise = (async () => {
    const connectSocket = (await import("./connectSocket.js")).default;
    const { subscribe } = await import("./connection/subscriptions.js");

    // Connect
    const client = connectSocket();
    connectSocket.autoReconnect();

    // Track connection state
    client.onConnectionChange((state) => {
      currentConnectionState = state;
      connectionChangeHandlers.forEach((fn) => fn(state));
    });

    resolvedClient = client;

    // Flush buffered subscriptions
    bufferedSubscriptions.forEach(({ channel, callback, resolve }) => {
      const unsub = subscribe(channel, callback);
      resolve(unsub);
    });
    bufferedSubscriptions.length = 0;

    // Flush buffered calls
    bufferedCalls.forEach(({ method, args, resolve, reject }) => {
      try {
        const result = client.sender[method](...args);
        if (result && typeof result.then === "function") {
          result.then(resolve).catch(reject);
        } else {
          resolve(result);
        }
      } catch (err) {
        reject(err);
      }
    });
    bufferedCalls.length = 0;

    return client;
  })();

  return clientPromise;
}

/**
 * Proxy object that intercepts API calls and routes them through the client
 *
 * This proxy provides the main API interface. Property access is intercepted
 * to return functions that either call the client directly (if ready) or
 * buffer the call for later execution.
 *
 * Subscriptions are detected by passing a function as the argument:
 * - `api.news.banking({ data })` → RPC call (returns Promise)
 * - `api.news.banking(callback)` → Subscription (returns unsubscribe function)
 *
 * @type {Proxy}
 * @private
 *
 * @property {Function} onConnectionChange - Subscribe to connection state changes
 * @property {string|null} transport - Current transport type ('websocket', 'polling', or null)
 */
const senderProxy = new Proxy(
  {},
  {
    /**
     * Proxy get trap - intercepts property access on the api object
     *
     * @param {Object} target - The proxy target (empty object)
     * @param {string|symbol} prop - The property being accessed
     * @returns {Function|undefined|null} The appropriate handler or value
     */
    get(target, prop) {
      // Reserved properties
      if (prop === "onConnectionChange") return onConnectionChange;
      if (prop === "transport") return resolvedClient?.transport || null;
      if (prop === "then" || prop === "catch") return undefined; // Not a Promise

      // Return a function that either calls directly or buffers
      return (...args) => {
        // If client is ready, call directly
        if (resolvedClient) {
          return resolvedClient.sender[prop](...args);
        }

        // Buffer the call and return a Promise
        return new Promise((resolve, reject) => {
          bufferedCalls.push({ method: prop, args, resolve, reject });
          // Ensure client is initializing
          getClient();
        });
      };
    },
  },
);

/**
 * Subscribe to connection state changes
 *
 * Registers a handler that is called whenever the connection state changes.
 * The handler is immediately invoked with the current state upon registration.
 *
 * @param {Function} handler - Callback function invoked on state changes
 * @param {import('./connection/state').ConnectionStateValue} handler.state - The new connection state
 * @returns {Function} Unsubscribe function - call to stop receiving updates
 *
 * @example
 * // Monitor connection state
 * const unsubscribe = api.onConnectionChange((state) => {
 *   switch (state) {
 *     case 'connected':
 *       console.log('✅ Connected to server')
 *       break
 *     case 'disconnected':
 *       console.log('❌ Disconnected from server')
 *       break
 *     case 'connecting':
 *       console.log('⏳ Connecting...')
 *       break
 *     case 'offline':
 *       console.log('📵 Browser is offline')
 *       break
 *     case 'walled':
 *       console.log('🚧 Captive portal detected')
 *       break
 *   }
 * })
 *
 * // Later: stop listening
 * unsubscribe()
 */
function onConnectionChange(handler) {
  connectionChangeHandlers.push(handler);
  // Immediately call with current state
  handler(currentConnectionState);

  // If client exists, also register with it
  if (resolvedClient) {
    return resolvedClient.onConnectionChange(handler);
  }

  // Ensure client is initializing
  getClient();

  // Return unsubscribe function
  return () => {
    const idx = connectionChangeHandlers.indexOf(handler);
    if (idx > -1) connectionChangeHandlers.splice(idx, 1);
  };
}

// Define properties on the proxy to avoid Proxy interception issues
Object.defineProperty(senderProxy, "onConnectionChange", {
  value: onConnectionChange,
  writable: false,
  enumerable: false,
  configurable: false,
});

// Auto-initialize in browser
if (isBrowser) {
  getClient();
}

/**
 * The main api-ape client proxy
 *
 * This is the default export - a Proxy object that provides a clean API
 * for making WebSocket calls to the server. All method calls are automatically
 * buffered until the connection is established.
 *
 * @type {Proxy}
 *
 * @example
 * import api from 'api-ape'
 *
 * // Make API calls (RPC)
 * const result = await api.users({ name: 'John' })
 *
 * // With path segments
 * const user = await api.users('/123')
 *
 * // Subscribe to channels (pass a callback function)
 * const unsub = api.news.banking(data => {
 *   console.log('Received:', data)
 * })
 *
 * // Unsubscribe when done
 * unsub()
 */
export default senderProxy;

/**
 * Named exports for more explicit imports
 * @example
 * import { onConnectionChange, getClient } from 'api-ape'
 */
export { onConnectionChange, getClient };
