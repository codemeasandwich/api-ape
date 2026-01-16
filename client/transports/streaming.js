/**
 * @fileoverview HTTP Streaming Transport for api-ape Client
 *
 * This module provides an HTTP-based fallback transport when WebSocket
 * connections are blocked or unavailable (e.g., corporate firewalls,
 * restrictive proxies, or networks that block WebSocket upgrades).
 *
 * ## Transport Architecture
 *
 * The streaming transport uses two HTTP channels:
 * 1. **GET channel** (long-polling): Receives server messages via chunked transfer
 * 2. **POST channel**: Sends client messages as individual HTTP requests
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                     Client                                  │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Outgoing Messages (POST)     │  Incoming Messages (GET)    │
 * │  ────────────────────────     │  ─────────────────────────  │
 * │  POST /api/ape/poll           │  GET /api/ape/poll          │
 * │  Body: { type, data }         │  Chunked Response Stream    │
 * │  Response: { data }           │  ← JSON messages            │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Connection Lifecycle
 *
 * 1. `connect()` - Opens GET stream to receive server messages
 * 2. Messages arrive as chunked JSON in the response body
 * 3. `send()` - Sends messages via POST requests
 * 4. `close()` - Closes the stream and cleans up
 *
 * ## Heartbeat Mechanism
 *
 * The server sends periodic `__heartbeat__` messages to keep the connection
 * alive. These are filtered out and not passed to message handlers.
 *
 * ## Auto-Reconnection
 *
 * If the stream is interrupted, the transport automatically reconnects
 * after a short delay (500ms).
 *
 * @module client/transports/streaming
 * @see {@link module:client/connectSocket} for transport selection logic
 *
 * @example
 * // Creating and using the streaming transport
 * import { createStreamingTransport } from './streaming'
 *
 * const transport = createStreamingTransport()
 *
 * // Set up event handlers
 * transport.onOpen = () => console.log('Connected!')
 * transport.onMessage = (msg) => console.log('Received:', msg)
 * transport.onClose = () => console.log('Disconnected')
 * transport.onError = (err) => console.error('Error:', err)
 *
 * // Connect
 * transport.connect()
 *
 * // Send a message
 * const response = await transport.send('/chat', { text: 'Hello!' }, Date.now())
 *
 * // Close when done
 * transport.close()
 */

import jss from "../../utils/jss";
import { parseStreamBuffer } from "./streamParser";

/**
 * Build the polling endpoint URL based on current page location
 *
 * Constructs the full URL to the /api/ape/poll endpoint, handling:
 * - Protocol (http/https)
 * - Hostname
 * - Port (with special handling for localhost development)
 *
 * @returns {string} Full URL to the polling endpoint
 * @private
 *
 * @example
 * // On https://example.com
 * getPollUrl() // 'https://example.com/api/ape/poll'
 *
 * // On http://localhost (no port specified)
 * getPollUrl() // 'http://localhost:9010/api/ape/poll'
 *
 * // On http://localhost:3000
 * getPollUrl() // 'http://localhost:3000/api/ape/poll'
 */
function getPollUrl() {
  const hostname = window.location.hostname;
  const localServers = ["localhost", "127.0.0.1", "[::1]"];
  const isLocal = localServers.includes(hostname);
  const isHttps = window.location.protocol === "https:";
  const port = window.location.port || (isLocal ? 9010 : isHttps ? 443 : 80);
  const protocol = isHttps ? "https" : "http";
  const portSuffix = port !== 80 && port !== 443 ? `:${port}` : "";
  return `${protocol}://${hostname}${portSuffix}/api/ape/poll`;
}

/**
 * Create an HTTP streaming transport instance
 *
 * Factory function that creates a streaming transport object with methods
 * for connecting, sending messages, and handling events.
 *
 * ## Transport Object Properties
 *
 * | Property      | Type     | Description                              |
 * |---------------|----------|------------------------------------------|
 * | `connect`     | Function | Initiates the streaming connection       |
 * | `send`        | Function | Sends a message via POST                 |
 * | `close`       | Function | Closes the connection                    |
 * | `isConnected` | Function | Returns current connection status        |
 * | `onMessage`   | Setter   | Handler for incoming messages            |
 * | `onOpen`      | Setter   | Handler for connection open event        |
 * | `onClose`     | Setter   | Handler for connection close event       |
 * | `onError`     | Setter   | Handler for error events                 |
 *
 * ## Internal State
 *
 * The transport maintains internal state for:
 * - Active connection status
 * - Abort controller for cancelling fetch requests
 * - Stream buffer for partial JSON parsing
 * - Reconnection timer
 *
 * @returns {StreamingTransport} The streaming transport instance
 *
 * @typedef {Object} StreamingTransport
 * @property {function(): Promise<void>} connect - Connect to the server
 * @property {function(string, any, number): Promise<any>} send - Send a message
 * @property {function(): void} close - Close the connection
 * @property {function(): boolean} isConnected - Check if connected
 *
 * @example
 * // Basic usage
 * const transport = createStreamingTransport()
 *
 * transport.onMessage = (msg) => {
 *   console.log('Type:', msg.type)
 *   console.log('Data:', msg.data)
 *   if (msg.err) console.error('Error:', msg.err)
 * }
 *
 * transport.onOpen = () => {
 *   console.log('Stream connected')
 * }
 *
 * await transport.connect()
 *
 * @example
 * // Sending messages
 * const transport = createStreamingTransport()
 * await transport.connect()
 *
 * try {
 *   const result = await transport.send('/users', { action: 'list' }, Date.now())
 *   console.log('Users:', result)
 * } catch (err) {
 *   console.error('Request failed:', err)
 * }
 *
 * @example
 * // Integration with connectSocket
 * if (shouldFallbackToStreaming) {
 *   const streaming = createStreamingTransport()
 *   streaming.onMessage = handleMessage
 *   streaming.onOpen = () => {
 *     notifyConnectionChange(ConnectionState.Connected)
 *     flushPendingMessages(streaming.send)
 *   }
 *   streaming.connect()
 * }
 */
function createStreamingTransport() {
  /**
   * Whether the transport is currently active/connected
   * @type {boolean}
   * @private
   */
  let isActive = false;

  /**
   * AbortController for cancelling the fetch request
   * @type {AbortController|null}
   * @private
   */
  let abortController = null;

  /**
   * Buffer for accumulating partial JSON from the stream
   * @type {string}
   * @private
   */
  let streamBuffer = "";

  /**
   * Timer for scheduled reconnection attempts
   * @type {number|null}
   * @private
   */
  let reconnectTimer = null;

  /**
   * Handler called when a message is received
   * @type {function({type: string, data: any, err?: any}): void}
   * @private
   */
  let onMessage = () => {};

  /**
   * Handler called when connection is established
   * @type {function(): void}
   * @private
   */
  let onOpen = () => {};

  /**
   * Handler called when connection is closed
   * @type {function(): void}
   * @private
   */
  let onClose = () => {};

  /**
   * Handler called when an error occurs
   * @type {function(Error): void}
   * @private
   */
  let onError = () => {};

  /**
   * Schedule a reconnection attempt after a delay
   *
   * Used when the stream is interrupted unexpectedly.
   * Only schedules if the transport is still active.
   *
   * @private
   */
  function scheduleReconnect() {
    if (!isActive) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (isActive) connect();
    }, 500);
  }

  /**
   * Connect to the server and start receiving messages
   *
   * Initiates a GET request to the polling endpoint. The server keeps
   * this connection open and streams JSON messages as chunked responses.
   *
   * ## Connection Flow
   *
   * 1. Abort any existing connection
   * 2. Create new AbortController for cancellation
   * 3. Start GET request to /api/ape/poll
   * 4. On success, call onOpen and start reading stream
   * 5. Parse incoming data for complete JSON objects
   * 6. Dispatch messages (except heartbeats) to onMessage
   * 7. On stream end, schedule reconnection
   *
   * ## Error Handling
   *
   * - Network errors trigger onError and reconnection
   * - AbortError (from close()) is silently ignored
   * - HTTP errors throw and trigger reconnection
   *
   * @async
   * @returns {Promise<void>}
   *
   * @example
   * const transport = createStreamingTransport()
   * transport.onOpen = () => console.log('Connected!')
   * transport.onMessage = (msg) => console.log('Message:', msg)
   * await transport.connect()
   */
  async function connect() {
    if (isActive) return;
    isActive = true;
    abortController = new AbortController();

    try {
      const response = await fetch(getPollUrl(), {
        method: "GET",
        credentials: "include",
        signal: abortController.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok)
        throw new Error(`Stream connect failed: ${response.status}`);

      // Connection established
      onOpen();

      // Start reading the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      /**
       * Read loop - continuously reads from the stream
       * @async
       * @private
       */
      async function read() {
        while (isActive) {
          try {
            const { done, value } = await reader.read();

            if (done) {
              // Stream ended - reconnect
              scheduleReconnect();
              return;
            }

            // Decode chunk and add to buffer
            streamBuffer += decoder.decode(value, { stream: true });

            // Parse complete JSON objects from buffer
            const { messages, remaining } = parseStreamBuffer(streamBuffer);
            streamBuffer = remaining;

            // Dispatch messages (filter out heartbeats)
            for (const msg of messages) {
              if (msg.type === "__heartbeat__") continue;
              onMessage(msg);
            }
          } catch (readErr) {
            // Ignore abort errors (from close())
            if (readErr.name === "AbortError") return;

            console.error("🦍 Stream read error:", readErr);
            scheduleReconnect();
            return;
          }
        }
      }

      // Start the read loop
      read();
    } catch (err) {
      // Ignore abort errors (from close())
      if (err.name === "AbortError") return;

      console.error("🦍 Stream connection error:", err);
      onError(err);
      scheduleReconnect();
    }
  }

  /**
   * Send a message to the server via HTTP POST
   *
   * Each send() call creates a new POST request to the polling endpoint.
   * The server processes the message and returns the response.
   *
   * ## Request Format
   *
   * ```json
   * {
   *   "type": "/chat",
   *   "data": { "message": "Hello" },
   *   "createdAt": "2024-01-01T00:00:00.000Z"
   * }
   * ```
   *
   * ## Response Format
   *
   * ```json
   * {
   *   "data": { "result": "success" }
   * }
   * ```
   *
   * or on error:
   *
   * ```json
   * {
   *   "error": "Error message"
   * }
   * ```
   *
   * @async
   * @param {string} type - The message type/endpoint path (e.g., '/chat')
   * @param {any} data - The payload data to send
   * @param {number} createdAt - Timestamp when the request was initiated
   * @returns {Promise<any>} The server's response data
   * @throws {Error} If the request fails or server returns an error
   *
   * @example
   * // Simple request
   * const result = await transport.send('/ping', {}, Date.now())
   *
   * @example
   * // With data
   * const user = await transport.send('/users/create', {
   *   name: 'Alice',
   *   email: 'alice@example.com'
   * }, Date.now())
   *
   * @example
   * // Error handling
   * try {
   *   await transport.send('/protected', {}, Date.now())
   * } catch (err) {
   *   console.error('Request failed:', err.message)
   * }
   */
  async function send(type, data, createdAt) {
    const payload = { type, data, createdAt: new Date(createdAt) };

    const response = await fetch(getPollUrl(), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: jss.stringify(payload),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `Request failed: ${response.status}`);
    }

    return jss.parse(await response.text()).data;
  }

  /**
   * Close the streaming connection
   *
   * Gracefully shuts down the transport:
   * 1. Marks transport as inactive
   * 2. Clears any pending reconnection timer
   * 3. Aborts the active fetch request
   * 4. Clears the stream buffer
   * 5. Calls the onClose handler
   *
   * After close(), the transport can be reconnected by calling connect() again.
   *
   * @returns {void}
   *
   * @example
   * // Normal shutdown
   * transport.close()
   *
   * @example
   * // Close and reconnect
   * transport.close()
   * await transport.connect()  // Can reconnect after close
   *
   * @example
   * // Close on page unload
   * window.addEventListener('beforeunload', () => {
   *   transport.close()
   * })
   */
  function close() {
    isActive = false;

    // Clear reconnection timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Abort the fetch request
    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    // Clear the buffer
    streamBuffer = "";

    // Notify listeners
    onClose();
  }

  /**
   * The streaming transport instance
   *
   * @type {StreamingTransport}
   */
  return {
    /**
     * Connect to the server
     * @type {function(): Promise<void>}
     */
    connect,

    /**
     * Send a message to the server
     * @type {function(string, any, number): Promise<any>}
     */
    send,

    /**
     * Close the connection
     * @type {function(): void}
     */
    close,

    /**
     * Check if the transport is currently connected
     * @type {function(): boolean}
     */
    isConnected: () => isActive,

    /**
     * Set the message handler
     * @param {function({type: string, data: any, err?: any}): void} fn - Handler function
     */
    set onMessage(fn) {
      onMessage = fn;
    },

    /**
     * Set the open handler
     * @param {function(): void} fn - Handler function
     */
    set onOpen(fn) {
      onOpen = fn;
    },

    /**
     * Set the close handler
     * @param {function(): void} fn - Handler function
     */
    set onClose(fn) {
      onClose = fn;
    },

    /**
     * Set the error handler
     * @param {function(Error): void} fn - Handler function
     */
    set onError(fn) {
      onError = fn;
    },
  };
}

/**
 * Export the factory function and URL helper
 *
 * @example
 * import { createStreamingTransport, getPollUrl } from './streaming'
 *
 * // Create a new transport
 * const transport = createStreamingTransport()
 *
 * // Get the polling URL (useful for debugging)
 * console.log('Polling URL:', getPollUrl())
 */
export { createStreamingTransport, getPollUrl };
