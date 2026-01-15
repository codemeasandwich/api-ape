/**
 * @fileoverview WebSocket Connection Wiring for api-ape Server
 *
 * This module handles the setup and lifecycle of WebSocket connections.
 * It orchestrates the connection between incoming WebSocket clients and
 * the api-ape message handling system.
 *
 * ## Connection Lifecycle
 *
 * ```
 * WebSocket Connection Established
 *         │
 *         ▼
 * ┌───────────────────────────────────────────────────────────────┐
 * │  wiring() returns webSocketHandler                           │
 * └───────────────────────────────────────────────────────────────┘
 *         │
 *         ▼
 * ┌───────────────────────────────────────────────────────────────┐
 * │  webSocketHandler(socket, req)                                │
 * │  ├── Generate unique clientId                                 │
 * │  ├── Parse user-agent                                         │
 * │  ├── Extract sessionId from cookies                           │
 * │  ├── Add client to broadcast.clients                          │
 * │  └── Call onConnect callback (async)                          │
 * └───────────────────────────────────────────────────────────────┘
 *         │
 *         ▼
 * ┌───────────────────────────────────────────────────────────────┐
 * │  onConnect resolves with event handlers                       │
 * │  ├── embed: Custom values for this client                     │
 * │  ├── onReceive: Called when message received                  │
 * │  ├── onSend: Called when message sent                         │
 * │  ├── onError: Called on errors                                │
 * │  └── onDisconnect: Called when client disconnects             │
 * └───────────────────────────────────────────────────────────────┘
 *         │
 *         ▼
 * ┌───────────────────────────────────────────────────────────────┐
 * │  Connection Active                                            │
 * │  ├── Messages handled by socketReceive                        │
 * │  ├── Responses sent by socketSend                             │
 * │  └── Binary data via fileTransfer                             │
 * └───────────────────────────────────────────────────────────────┘
 *         │
 *         ▼
 * ┌───────────────────────────────────────────────────────────────┐
 * │  Socket Close Event                                           │
 * │  ├── Remove client from broadcast.clients                     │
 * │  └── Call onDisconnect handler                                │
 * └───────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Event Handler Interface
 *
 * The `onConnect` callback should return an object with optional event handlers:
 *
 * | Handler       | Signature                           | Description                    |
 * |---------------|-------------------------------------|--------------------------------|
 * | `embed`       | `Object`                            | Values available in controllers|
 * | `onReceive`   | `(queryId, data, type) => any`      | Called when message received   |
 * | `onSend`      | `(data, type) => any`               | Called when message sent       |
 * | `onError`     | `(errorString) => void`             | Called on errors               |
 * | `onDisconnect`| `() => void`                        | Called when client disconnects |
 *
 * ## Security
 *
 * - Origin validation via `security/origin.js` prevents CSRF attacks
 * - Session ID extracted from cookies for authentication
 * - Client tracking for audit and rate limiting
 *
 * @module server/lib/wiring
 * @see {@link module:server/socket/open} for connection validation
 * @see {@link module:server/socket/receive} for message handling
 * @see {@link module:server/socket/send} for response sending
 * @see {@link module:server/lib/broadcast} for client tracking
 *
 * @example <caption>Basic Usage with onConnect</caption>
 * const wiring = require('./wiring')
 * const controllers = { ping: () => 'pong' }
 *
 * const handler = wiring(controllers, (socket, req, send) => {
 *   console.log('Client connected')
 *   return {
 *     embed: { userId: 'anonymous' },
 *     onDisconnect: () => console.log('Client disconnected')
 *   }
 * })
 *
 * wss.on('connection', handler)
 *
 * @example <caption>Authentication in onConnect</caption>
 * const handler = wiring(controllers, async (socket, req, send) => {
 *   // Extract and verify JWT from cookies
 *   const token = req.headers.cookie?.match(/token=([^;]+)/)?.[1]
 *
 *   try {
 *     const user = await verifyJWT(token)
 *
 *     // Send welcome message
 *     send('welcome', { userId: user.id, name: user.name })
 *
 *     return {
 *       embed: {
 *         userId: user.id,
 *         permissions: user.permissions,
 *         isAdmin: user.roles.includes('admin')
 *       },
 *       onReceive: (queryId, data, type) => {
 *         logActivity(user.id, type, data)
 *       },
 *       onDisconnect: () => {
 *         updateUserStatus(user.id, 'offline')
 *       }
 *     }
 *   } catch (err) {
 *     // Reject connection
 *     send('error', { message: 'Authentication failed' })
 *     socket.close(4001, 'Unauthorized')
 *     return null
 *   }
 * })
 *
 * @example <caption>Rate Limiting Example</caption>
 * const handler = wiring(controllers, (socket, req, send) => {
 *   const ip = req.socket.remoteAddress
 *   const rateLimit = createRateLimiter(ip, { max: 100, window: 60000 })
 *
 *   return {
 *     embed: { ip, rateLimit },
 *     onReceive: (queryId, data, type) => {
 *       if (!rateLimit.check()) {
 *         throw new Error('Rate limit exceeded')
 *       }
 *     }
 *   }
 * })
 */

const replySecurity = require("../security/reply");
const socketOpen = require("../socket/open");
const socketReceive = require("../socket/receive");
const socketSend = require("../socket/send");
const makeid = require("../utils/genId");
const parseUserAgent = require("../utils/parseUserAgent");
const {
  addClient,
  removeClient,
  updateClientEmbed,
  updateClientSend,
} = require("./broadcast");

/**
 * Merge user-provided event handlers with default no-op handlers
 *
 * Ensures that all event handler properties exist with at least a no-op
 * function, preventing null checks throughout the codebase.
 *
 * @param {Object} [events={}] - User-provided event handlers from onConnect
 * @param {Object} [events.embed={}] - Custom values to embed in controller context
 * @param {Function} [events.onReceive] - Called when a message is received
 * @param {Function} [events.onSend] - Called when a message is sent
 * @param {Function} [events.onError] - Called when an error occurs
 * @param {Function} [events.onDisconnect] - Called when the client disconnects
 * @returns {Object} Merged event handlers with defaults for any missing handlers
 * @private
 *
 * @example
 * // User returns partial handlers
 * const userEvents = { embed: { userId: 123 }, onDisconnect: () => {} }
 *
 * const merged = defaultEvents(userEvents)
 * // merged = {
 * //   embed: { userId: 123 },
 * //   onReceive: () => {},      // default no-op
 * //   onSend: () => {},         // default no-op
 * //   onError: console.error,   // default error logger
 * //   onDisconnect: () => {}    // user provided
 * // }
 */
function defaultEvents(events = {}) {
  const fallBackEvents = {
    /**
     * Default embed - empty object
     * @type {Object}
     */
    embed: {},

    /**
     * Default onReceive - no-op
     * @type {Function}
     */
    onReceive: () => {},

    /**
     * Default onSend - no-op
     * @type {Function}
     */
    onSend: () => {},

    /**
     * Default onError - logs to console
     * @param {string} errSt - Error message
     */
    onError: (errSt) => console.error(errSt),

    /**
     * Default onDisconnect - no-op
     * @type {Function}
     */
    onDisconnect: () => {},
  };

  return Object.assign({}, fallBackEvents, events);
}

/**
 * Create a WebSocket connection handler for api-ape
 *
 * This factory function creates a handler that should be attached to a
 * WebSocketServer's 'connection' event. It sets up the full api-ape
 * pipeline for each connecting client.
 *
 * ## Handler Responsibilities
 *
 * 1. **Client Identification**: Generates unique clientId, extracts sessionId
 * 2. **User-Agent Parsing**: Identifies browser, OS, device type
 * 3. **Client Tracking**: Registers client in the broadcast system
 * 4. **Lifecycle Management**: Calls onConnect, manages disconnect cleanup
 * 5. **Message Pipeline**: Sets up receive/send handlers for the socket
 * 6. **Security**: Validates origin, prevents replay attacks
 *
 * ## onConnect Callback
 *
 * The `onConnect` function is called with:
 * - `socket`: The WebSocket instance
 * - `req`: The HTTP upgrade request
 * - `send`: Function to send messages to this client
 *
 * It can return (or resolve to) an object with:
 * - `embed`: Object of values available in all controllers as `this.*`
 * - `onReceive(queryId, data, type)`: Called for each incoming message
 * - `onSend(data, type)`: Called for each outgoing message
 * - `onError(errorString)`: Called when errors occur
 * - `onDisconnect()`: Called when the client disconnects
 *
 * @param {Object} controllers - Loaded controller functions keyed by endpoint path
 * @param {Function} [onConnect] - Async callback for connection setup
 * @param {Object} [fileTransfer] - File transfer manager instance for binary data
 * @returns {Function} WebSocket connection handler `(socket, req) => void`
 *
 * @example <caption>Minimal Setup</caption>
 * const handler = wiring(controllers)
 * wss.on('connection', handler)
 *
 * @example <caption>With Authentication</caption>
 * const handler = wiring(controllers, async (socket, req, send) => {
 *   const user = await authenticateRequest(req)
 *   if (!user) {
 *     socket.close(4001, 'Unauthorized')
 *     return null
 *   }
 *
 *   return {
 *     embed: { user, permissions: user.permissions },
 *     onDisconnect: () => logUserDisconnect(user.id)
 *   }
 * }, fileTransferManager)
 *
 * @example <caption>With Message Logging</caption>
 * const handler = wiring(controllers, (socket, req, send) => {
 *   const clientIp = req.socket.remoteAddress
 *
 *   return {
 *     embed: { ip: clientIp },
 *     onReceive: (queryId, data, type) => {
 *       console.log(`[${clientIp}] Received ${type}:`, data)
 *     },
 *     onSend: (data, type) => {
 *       console.log(`[${clientIp}] Sent ${type}:`, data)
 *     },
 *     onError: (errString) => {
 *       console.error(`[${clientIp}] Error:`, errString)
 *     }
 *   }
 * })
 *
 * @example <caption>Early Message Sending</caption>
 * const handler = wiring(controllers, (socket, req, send) => {
 *   // Send messages before returning
 *   // These are buffered until the connection is fully set up
 *   send('server-info', { version: '1.0', time: Date.now() })
 *   send('motd', { message: 'Welcome to the server!' })
 *
 *   return { embed: {} }
 * })
 */
module.exports = function wiring(controllers, onConnect, fileTransfer) {
  // Default onConnect to no-op if not provided
  onConnect = onConnect || (() => {});

  /**
   * WebSocket connection handler
   *
   * Called by WebSocketServer when a new client connects.
   * Sets up the complete api-ape pipeline for this connection.
   *
   * @param {WebSocket} socket - The WebSocket instance for this connection
   * @param {http.IncomingMessage} req - The HTTP upgrade request
   */
  return function webSocketHandler(socket, req) {
    /**
     * Send function reference - assigned after setup completes
     * @type {Function|undefined}
     */
    let send;

    /**
     * Buffer for messages sent before send function is ready
     * These are flushed once the connection is fully established
     * @type {Array<Array<any>>}
     */
    let sentBufferAr = [];

    /**
     * Buffered send function
     *
     * If the send function isn't ready yet, buffer the message.
     * Otherwise, pass through to the real send function.
     *
     * @param {...any} args - Arguments to pass to send
     */
    /* istanbul ignore next 7 - send buffer fallthrough, only hit if user stores ref and calls later */
    const sentBufferFn = (...args) => {
      if (send) {
        send(...args);
      } else {
        sentBufferAr.push(args);
      }
    };

    /**
     * Generate unique client identifier
     * Uses 20-character Crockford Base32 string for uniqueness
     * @type {string}
     */
    const clientId = makeid(20);

    /**
     * Parse user-agent header for browser/OS/device detection
     * @type {Object}
     */
    const agent = parseUserAgent(req.headers["user-agent"]);

    /**
     * Extract sessionId from cookies
     *
     * Looks for a cookie named 'sessionId' which may be set by
     * the outer web framework (Express, Koa, etc.)
     *
     * @type {string|null}
     */
    const sessionIdMatch = (req.headers.cookie || "").match(
      /(?:^|;\s*)sessionId=([^;]*)/,
    );
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

    /**
     * Shared values accessible in onConnect callback
     *
     * The send function's toString() returns the clientId for identification
     *
     * @type {Object}
     */
    const sharedValues = {
      socket,
      req,
      agent,
      send: (type, data, err) => sentBufferFn(false, type, data, err),
    };

    // Allow clientId to be retrieved from send function
    sharedValues.send.toString = () => clientId;

    /**
     * Register client for broadcast BEFORE calling onConnect
     *
     * This ensures ape.clients.size returns the correct count
     * when the onConnect callback executes and potentially sends
     * initial messages.
     */
    addClient({ clientId, sessionId, agent, send: null, embed: null });

    /**
     * Set up disconnect handler early
     *
     * This will properly clean up the client even if onConnect
     * fails or the connection closes during setup.
     */
    socket.on("close", () => {
      removeClient(clientId);
    });

    /**
     * Call onConnect and handle the result
     *
     * onConnect can be sync or async. We normalize to Promise
     * and then process the returned event handlers.
     */
    let result = onConnect(socket, req, sharedValues.send);

    // Normalize to Promise
    if (!result || !result.then) {
      result = Promise.resolve(result);
    }

    result
      .then(defaultEvents)
      .then(({ embed, onReceive, onSend, onError, onDisconnect }) => {
        /**
         * Validate connection security (origin check)
         *
         * If validation fails, the socket is destroyed and we clean up.
         */
        const isOk = socketOpen(socket, req, onError);

        /* istanbul ignore next 4 - origin validation failure, requires CORS misconfiguration */
        if (!isOk) {
          removeClient(clientId); // Clean up if connection fails
          return;
        }

        /**
         * Create replay attack prevention checker
         *
         * This tracks recent queryIds and timestamps to prevent
         * duplicate or stale requests from being processed.
         */
        const checkReply = replySecurity();

        /**
         * Ape context object
         *
         * Contains all the information needed by the socket handlers
         * to process messages for this connection.
         *
         * @type {Object}
         */
        const ape = {
          socket,
          req,
          clientId,
          checkReply,
          events: { onReceive, onSend, onError, onDisconnect },
          controllers,
          sharedValues,
          embedValues: embed,
          fileTransfer,
        };

        /**
         * Create the send handler for this connection
         * @type {Function}
         */
        send = socketSend(ape);
        ape.send = send;

        /**
         * Update client record with actual send function and embed values
         *
         * Now that setup is complete, the client can receive messages
         * and the embed values are available for querying.
         */
        updateClientSend(clientId, send);
        updateClientEmbed(clientId, embed);

        /**
         * Register disconnect handler with user callback
         *
         * When the socket closes, call the user's onDisconnect handler.
         * The removeClient call was already set up above.
         */
        socket.on("close", () => {
          onDisconnect();
        });

        /**
         * Send connection acknowledgment with clientId
         *
         * This allows WebSocket clients to know their clientId for use
         * in HTTP requests (e.g., binary file uploads via PUT).
         */
        send(null, "__connected__", { clientId }, null);

        /**
         * Flush any messages that were buffered during setup
         *
         * These are typically messages sent from within onConnect
         * before the send function was fully initialized.
         */
        sentBufferAr.forEach((args) => send(...args));
        sentBufferAr = [];

        /**
         * Attach the message handler
         *
         * All incoming WebSocket messages will be processed by
         * the socketReceive handler, which routes them to the
         * appropriate controller.
         */
        socket.on("message", socketReceive(ape));
      });
  };
};
