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
 * // Dynamic path segments — bracket access on the proxy chain
 * api.users[123]({ name: 'Updated Name' })
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

import { configureApeLogging } from "../utils/apeLogger.js";
import { wrap } from "./connection/proxy";
import { setOnReceiver } from "./connection/messageHandler";

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
 * @type {Array<{path: string, payload: any, resolve: Function, reject: Function}>}
 * @private
 */
const bufferedCalls = [];

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
 * Subscriptions need no buffering here: `subscribe()` (connection/subscriptions.js)
 * records the callback at once and `resubscribeAll()` sends every recorded
 * subscription when the socket opens.
 *
 * @returns {Promise<Object|null>} Promise resolving to the client interface,
 *                                  or null when running in SSR/non-browser environment
 * @private
 */
function getClient() {
  if (clientPromise) return clientPromise;

  if (!isBrowser) {
    // Return a dummy object for SSR
    return Promise.resolve(null);
  }

  clientPromise = (async () => {
    const connectSocket = (await import("./connectSocket.js")).default;

    // Connect
    const client = connectSocket();
    connectSocket.autoReconnect();

    // Track connection state
    client.onConnectionChange((state) => {
      currentConnectionState = state;
      connectionChangeHandlers.forEach((fn) => fn(state));
    });

    resolvedClient = client;

    // Flush buffered calls
    bufferedCalls.forEach(({ path, payload, resolve, reject }) => {
      try {
        client.send(path, payload).then(resolve, reject);
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
 * Make one RPC call: straight through once the client is ready, buffered until then.
 *
 * @param {string} path - Endpoint path built by the proxy chain, e.g. `/users/create`
 * @param {any} payload - Call payload
 * @returns {Promise<any>} The server's reply
 * @private
 */
function call(path, payload) {
  if (resolvedClient) return resolvedClient.send(path, payload);

  const reply = new Promise((resolve, reject) => {
    bufferedCalls.push({ path, payload, resolve, reject });
    // Ensure client is initializing
    getClient();
  });
  // A call nobody looks at must not raise an unhandled rejection when it fails.
  reply.catch(() => {});
  return reply;
}

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
 * const unsubscribe = api.onConnectionChange((state) => {
 *   // 'offline' | 'walled' | 'disconnected' | 'connecting' | 'connected'
 *   console.log('Connection:', state)
 * })
 *
 * // Later: stop listening
 * unsubscribe()
 */
function onConnectionChange(handler) {
  connectionChangeHandlers.push(handler);
  // Immediately call with current state
  handler(currentConnectionState);

  // Ensure client is initializing
  getClient();

  // Return unsubscribe function
  return () => {
    const idx = connectionChangeHandlers.indexOf(handler);
    if (idx > -1) connectionChangeHandlers.splice(idx, 1);
  };
}

/**
 * Root of the api chain: a function carrying the reserved members (`on`,
 * `onConnectionChange`, `transport`, `configureLogging`) that `wrap()` passes through
 * instead of treating them as path segments.
 *
 * @type {Function}
 * @private
 */
const root = function apiRoot() {};
root.on = setOnReceiver;
root.onConnectionChange = onConnectionChange;
root.configureLogging = configureApeLogging;
Object.defineProperty(root, "transport", {
  get: () => resolvedClient?.transport || null,
  configurable: true,
});

// Auto-initialize in browser
if (isBrowser) {
  getClient();
}

/**
 * The main api-ape client proxy.
 *
 * Property access builds the path, a call with data is an RPC (returns a Promise),
 * a call with one function argument is a subscription (returns the unsubscribe
 * function synchronously, even before the connection is up). Built from the same
 * `wrap()` as `connectSocket().sender`, so both behave identically.
 *
 * @type {Proxy}
 *
 * @example
 * import api from 'api-ape'
 *
 * const users = await api.users.list({ active: true })    // /users/list
 * const user = await api.users[123]()                      // /users/123
 * const unsub = api.news.banking(data => console.log(data))
 * api.on('toast', ({ data }) => show(data))                // every push of that type
 * unsub()
 */
const senderProxy = wrap((path, payload) => call(path, payload), root);

export default senderProxy;

/**
 * Named exports for more explicit imports
 * @example
 * import { onConnectionChange, getClient } from 'api-ape'
 */
export { onConnectionChange, getClient, configureApeLogging };
