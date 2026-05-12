/**
 * @fileoverview Long Polling GET Handler - Streaming Response Transport
 *
 * This module implements the GET handler for api-ape's long polling fallback.
 * When WebSocket connections aren't available, clients can receive server events
 * through a streaming HTTP response.
 *
 * How Streaming GET Works:
 * 1. Client makes a GET request to the polling endpoint
 * 2. Server holds the connection open and sets streaming headers
 * 3. Server writes JSON events to the response stream as they occur
 * 4. Heartbeats are sent every 20 seconds to keep the connection alive
 * 5. Connection is closed after 25 seconds (client reconnects automatically)
 *
 * This approach provides:
 * - Real-time server-to-client communication over HTTP
 * - Works through firewalls that block WebSocket
 * - Automatic session management via cookies
 * - Integration with api-ape's broadcast system
 *
 * @module server/lib/longPolling/getHandler
 * @see {@link module:server/lib/longPolling} - Main long polling module
 * @see {@link module:server/lib/longPolling/postHandler} - POST handler for client messages
 * @see {@link module:server/lib/broadcast} - Broadcast system integration
 *
 * @example
 * // Create GET handler
 * const { createGetHandler, ensureClientId } = require('./getHandler')
 *
 * const handleStreamGet = createGetHandler(streamClients, onConnect)
 *
 * // Use in HTTP server
 * server.on('request', (req, res) => {
 *     if (req.url === '/api/ape/poll' && req.method === 'GET') {
 *         handleStreamGet(req, res)
 *     }
 * })
 */

const { apeLog } = require("../../../utils/apeLogger");
const { addClient, removeClient, updateClientEmbed } = require("../broadcast");
const makeid = require("../../utils/genId");
const jss = require("../../../utils/jss");
const parseUserAgent = require("../../utils/parseUserAgent");
const {
  effectiveSessionIdForRequest,
} = require("../sessionIdentity");

/**
 * Ensures a client has a unique identifier, creating one if necessary.
 *
 * Checks for an existing `apeClientId` cookie in the request. If not found,
 * generates a new 20-character ID and sets it as a cookie on the response.
 *
 * The cookie is configured with:
 * - `HttpOnly`: Not accessible via JavaScript (XSS protection)
 * - `SameSite=Strict`: Only sent with same-site requests (CSRF protection)
 * - `Path=/`: Available for all paths on the domain
 *
 * @function ensureClientId
 * @param {http.IncomingMessage} req - The HTTP request object
 * @param {http.ServerResponse} res - The HTTP response object
 * @returns {string} The client ID (existing or newly created)
 *
 * @example
 * // In request handler
 * const clientId = ensureClientId(req, res)
 * console.log(`Client ID: ${clientId}`)
 *
 * @example
 * // Subsequent requests will have the cookie
 * // Cookie header: apeClientId=Abc123XyzDefGhi456Jk
 */
function ensureClientId(req, res) {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(/(?:^|;\s*)apeClientId=([^;]*)/);

  if (match) {
    return match[1];
  }

  // Generate new client ID
  const clientId = makeid(20);

  // Set cookie with security attributes
  res.setHeader(
    "Set-Cookie",
    `apeClientId=${clientId}; Path=/; HttpOnly; SameSite=Strict`,
  );

  return clientId;
}

/**
 * @typedef {Object} ClientState
 * Internal state for a long-polling client connection.
 *
 * @property {http.ServerResponse} res - The HTTP response stream
 * @property {Array} messageQueue - Queue of pending messages (for future use)
 * @property {NodeJS.Timeout|null} heartbeatTimer - Timer for heartbeat messages
 * @property {boolean} isActive - Whether the connection is still active
 * @property {Object} [embed] - Custom data attached via onConnect
 * @property {Function} [onDisconnect] - Cleanup callback from onConnect
 */

/**
 * @typedef {Object} OnConnectResult
 * Return value from the onConnect callback.
 *
 * @property {Function} [onDisconnect] - Called when the client disconnects
 * @property {Object} [embed] - Custom data to attach to the client.
 *     This data is available in controller context.
 */

/**
 * Creates the GET request handler for streaming responses.
 *
 * The returned handler:
 * 1. Sets up streaming HTTP headers (no caching, keep-alive)
 * 2. Creates a send function for pushing events to the client
 * 3. Registers the client with the broadcast system
 * 4. Sets up heartbeats to keep the connection alive
 * 5. Calls onConnect callback if provided
 * 6. Cleans up on disconnect (timeout, close, or error)
 *
 * **Connection Lifecycle**:
 * - Connection opens → client registered → onConnect called
 * - Events are streamed as JSON lines
 * - Heartbeats sent every 20 seconds
 * - Connection closed after 25 seconds (client should reconnect)
 * - Cleanup removes client from broadcast system
 *
 * **Headers Set**:
 * - `Content-Type: application/json` - JSON event stream
 * - `Cache-Control: no-cache` - Prevent caching
 * - `Connection: keep-alive` - Keep TCP connection open
 * - `X-Accel-Buffering: no` - Disable nginx buffering
 *
 * @function createGetHandler
 * @param {Map<string, ClientState>} streamClients - Map of active client connections
 * @param {Function} [onConnect] - Optional callback when client connects.
 *     Receives (socket, req, send) and can return { onDisconnect, embed }.
 * @param {Object} [options] - Optional configuration options
 * @param {number} [options.heartbeatInterval=20000] - Interval in ms for heartbeat pings
 * @param {number} [options.recycleTimeout=25000] - Timeout in ms before recycling connection
 * @returns {Function} HTTP request handler function
 *
 * @example
 * // Basic usage
 * const streamClients = new Map()
 * const handleStreamGet = createGetHandler(streamClients)
 *
 * @example
 * // With onConnect callback
 * const handleStreamGet = createGetHandler(streamClients, async (socket, req, send) => {
 *     // Authenticate from session cookie
 *     const sessionId = getSessionFromCookie(req)
 *     const user = await getUserBySession(sessionId)
 *
 *     if (!user) {
 *         send('error', { message: 'Unauthorized' })
 *         return null
 *     }
 *
 *     // Send welcome message
 *     send('welcome', { userId: user.id })
 *
 *     return {
 *         embed: { userId: user.id, permissions: user.permissions },
 *         onDisconnect: () => {
 *             console.log(`User ${user.id} disconnected from long polling`)
 *         }
 *     }
 * })
 *
 * @example
 * // Client-side usage (browser)
 * const response = await fetch('/api/ape/poll')
 * const reader = response.body.getReader()
 * const decoder = new TextDecoder()
 *
 * while (true) {
 *     const { done, value } = await reader.read()
 *     if (done) break
 *
 *     const text = decoder.decode(value)
 *     const event = JSON.parse(text)
 *     console.log('Received:', event)
 * }
 */
function createGetHandler(streamClients, onConnect, options = {}) {
  const { heartbeatInterval = 20000, recycleTimeout = 25000 } = options;

  /**
   * HTTP GET request handler for streaming responses.
   *
   * @param {http.IncomingMessage} req - The HTTP request
   * @param {http.ServerResponse} res - The HTTP response
   */
  return function handleStreamGet(req, res) {
    // Get or create client ID from cookie
    const clientId = ensureClientId(req, res);

    // Set up streaming response headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering for real-time
    });

    /**
     * Client state object tracking this connection.
     * @type {ClientState}
     */
    const clientState = {
      res,
      messageQueue: [],
      heartbeatTimer: null,
      recycleTimer: null,
      isActive: true,
    };

    /**
     * Sends an event to the client.
     * Signature matches WebSocket send for compatibility with broadcast system.
     *
     * @param {string|null} queryId - Query ID (not used for polling, included for API compat)
     * @param {string} type - Event type (e.g., 'message', 'broadcast')
     * @param {*} data - Event payload
     * @param {*} [err] - Optional error information
     */
    const send = (queryId, type, data, err) => {
      if (!clientState.isActive) return;

      try {
        // Send in SSE format: data: {...}\n\n
        // Note: queryId is ignored for polling (it's for WS response correlation)
        res.write(
          "data: " +
            jss.stringify({ type, data, err: err || undefined, queryId }) +
            "\n\n",
        );
      } catch (e) {
        /* istanbul ignore next - stream write error, requires network failure */
        cleanup();
      }
    };

    // Make clientId accessible via send.toString()
    // This is used by the broadcast system to identify the client
    send.toString = () => clientId;

    /**
     * Cleans up the connection when it's no longer active.
     * Called on close, error, or timeout.
     */
    const cleanup = () => {
      if (!clientState.isActive) return;

      clientState.isActive = false;

      // Clear heartbeat timer.
      clearInterval(clientState.heartbeatTimer);

      // Clear recycle timer.
      clearTimeout(clientState.recycleTimer);

      // Remove from client maps
      streamClients.delete(clientId);
      removeClient({ clientId });

      // Call onDisconnect callback if provided
      if (clientState.onDisconnect) {
        clientState.onDisconnect();
      }
    };

    // Set up cleanup handlers
    req.on("close", cleanup);
    req.on("error", cleanup);
    res.on("error", cleanup);

    // Set up heartbeat to keep connection alive
    // Without this, proxies and browsers may close idle connections
    clientState.heartbeatTimer = setInterval(() => {
      try {
        // Use SSE comment format for heartbeat (doesn't trigger message parsing)
        res.write(":ping\n\n");
      } catch (e) {
        /* istanbul ignore next - heartbeat write error, requires network failure */
        cleanup();
      }
    }, heartbeatInterval);

    // Parse user agent for client info
    const sessionId = effectiveSessionIdForRequest(req);
    const agent = parseUserAgent(req.headers["user-agent"]);

    // Register client with the broadcast system
    addClient({ clientId, sessionId, agent, send, embed: null });

    // Add to stream clients map
    streamClients.set(clientId, clientState);

    // Send connection acknowledgment immediately
    // This is required for HTTP clients to know the stream is ready
    send(null, "__connected__", { clientId, sessionId }, null);

    // Call onConnect callback if provided
    /* istanbul ignore next 17 - onConnect callback handlers for long polling */
    if (onConnect) {
      Promise.resolve(onConnect(null, req, send))
        .then((handlers) => {
          if (handlers) {
            // Store onDisconnect handler
            if (handlers.onDisconnect) {
              clientState.onDisconnect = handlers.onDisconnect;
            }

            // Store embed data and update in broadcast system
            if (handlers.embed) {
              clientState.embed = handlers.embed;
              updateClientEmbed(clientId, handlers.embed);
            }
          }
        })
        .catch((err) => apeLog.error("onConnect error:", err));
    }

    // Close connection after 25 seconds to recycle
    // Client should automatically reconnect
    /* istanbul ignore next 11 - recycle timer, runs after test cleanup */
    clientState.recycleTimer = setTimeout(
      () => {
        cleanup();
        try {
          res.end();
        } catch (e) {
          /* ignore */
        }
      },
      recycleTimeout,
    );
  };
}

module.exports = {
  /**
   * Creates the GET handler for streaming responses.
   * @function
   */
  createGetHandler,

  /**
   * Ensures a client has a unique ID cookie.
   * @function
   */
  ensureClientId,
};
