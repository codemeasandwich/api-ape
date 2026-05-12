/**
 * @fileoverview Long Polling POST Handler - Client Message Processing
 *
 * This module implements the POST handler for api-ape's long polling fallback.
 * When clients can't use WebSocket, they send messages via HTTP POST requests
 * to this handler, which routes them to the appropriate controllers.
 *
 * How the POST Handler Works:
 * 1. Client sends a POST request with JSON body containing { type, data }
 * 2. Handler validates the client has an active session (from GET handler)
 * 3. Request body is parsed and the controller is looked up by type
 * 4. Controller is invoked with the same context as WebSocket handlers
 * 5. Response contains the controller's return value
 *
 * This provides the "send" half of long polling, complementing the GET
 * handler which provides the "receive" half.
 *
 * @module server/lib/longPolling/postHandler
 * @see {@link module:server/lib/longPolling} - Main long polling module
 * @see {@link module:server/lib/longPolling/getHandler} - GET handler for streaming responses
 * @see {@link module:server/lib/broadcast} - Broadcast system for sending to other clients
 *
 * @example
 * // Create POST handler
 * const { createPostHandler, getClientId } = require('./postHandler')
 *
 * const handleStreamPost = createPostHandler(streamClients)
 *
 * // Use in HTTP server
 * server.on('request', (req, res) => {
 *     if (req.url === '/api/ape/poll' && req.method === 'POST') {
 *         handleStreamPost(req, res, controllers)
 *     }
 * })
 *
 * @example
 * // Client-side usage (browser)
 * const response = await fetch('/api/ape/poll', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *         type: '/users/list',
 *         data: { limit: 10 }
 *     }),
 *     credentials: 'include' // Include cookies for session
 * })
 *
 * const result = await response.json()
 * console.log('Response:', result.data)
 */

const { clients } = require("../broadcast");
const jss = require("../../../utils/jss");
const messageHash = require("../../../utils/messageHash");

/**
 * Extracts the client ID from request cookies.
 *
 * Looks for the `apeClientId` cookie that was set by the GET handler.
 * This cookie identifies the client's long polling session.
 *
 * @function getClientId
 * @param {http.IncomingMessage} req - The HTTP request object
 * @returns {string|null} The client ID if found, null otherwise
 *
 * @example
 * // In request handler
 * const clientId = getClientId(req)
 * if (!clientId) {
 *     return sendJson(res, 401, { error: 'No session' })
 * }
 *
 * @example
 * // Cookie format: apeClientId=Abc123XyzDefGhi456Jk
 * const clientId = getClientId(req)
 * // Returns: 'Abc123XyzDefGhi456Jk'
 */
function getClientId(req) {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(/(?:^|;\s*)apeClientId=([^;]*)/);
  return match ? match[1] : null;
}

/**
 * Sends a JSON response with the specified status code.
 *
 * Utility function for consistent JSON response formatting.
 * Sets the Content-Type header and stringifies the data.
 *
 * @function sendJson
 * @param {http.ServerResponse} res - The HTTP response object
 * @param {number} statusCode - HTTP status code (e.g., 200, 400, 500)
 * @param {*} data - Data to JSON-stringify and send
 *
 * @example
 * // Success response
 * sendJson(res, 200, { data: { users: [...] } })
 *
 * @example
 * // Error response
 * sendJson(res, 404, { error: 'Controller not found' })
 *
 * @example
 * // Validation error
 * sendJson(res, 401, { error: 'Missing session' })
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * @typedef {Object} ControllerContext
 * Context object passed to controllers when handling POST requests.
 * Same structure as WebSocket controller context for consistency.
 *
 * @property {string} clientId - The client's unique identifier
 * @property {string|null} sessionId - Session ID from cookie (if present)
 * @property {http.IncomingMessage} req - The HTTP request object
 * @property {Function} broadcast - Send a message to all connected clients
 * @property {Function} broadcastOthers - Send to all clients except this one
 * @property {Map} clients - Map of all connected clients
 * @property {...*} [embed] - Custom properties from onConnect's embed object
 */

/**
 * @typedef {Object} PostRequestBody
 * Expected structure of the POST request body.
 *
 * @property {string} type - The controller/endpoint to invoke (e.g., '/users/list')
 * @property {*} data - The request payload to pass to the controller
 */

/**
 * Creates the POST request handler for processing client messages.
 *
 * The returned handler processes incoming messages from long polling clients
 * and routes them to the appropriate controllers. It provides the same
 * execution context as WebSocket message handlers, ensuring consistent
 * behavior regardless of transport.
 *
 * **Request Processing**:
 * 1. Validate client has a session (apeClientId cookie)
 * 2. Parse JSON body using JSS (supports Dates, Sets, Maps, etc.)
 * 3. Look up controller by type (path)
 * 4. Build context with embed values, broadcast functions, etc.
 * 5. Invoke controller and return result
 *
 * **Error Handling**:
 * - 401: Missing session (client should GET first)
 * - 404: Controller not found
 * - 500: Controller threw an error
 *
 * **Context Properties**:
 * Controllers receive a context object (`this`) with:
 * - `clientId`: Client's unique identifier
 * - `sessionId`: Session ID from cookie
 * - `req`: The HTTP request object
 * - `broadcast(type, data)`: Send to all clients
 * - `broadcastOthers(type, data)`: Send to all except this client
 * - `clients`: Map of all connected clients
 * - Plus any properties from `embed` (set via onConnect)
 *
 * @function createPostHandler
 * @param {Map<string, Object>} streamClients - Map of active client connections.
 *     Used to retrieve embed values set during GET connection.
 * @returns {Function} HTTP POST request handler
 *
 * @example
 * // Basic usage
 * const streamClients = new Map()
 * const handleStreamPost = createPostHandler(streamClients)
 *
 * // In request handler
 * handleStreamPost(req, res, controllers)
 *
 * @example
 * // Full integration
 * const { createGetHandler } = require('./getHandler')
 * const { createPostHandler } = require('./postHandler')
 *
 * const streamClients = new Map()
 * const handleStreamGet = createGetHandler(streamClients, onConnect)
 * const handleStreamPost = createPostHandler(streamClients)
 *
 * server.on('request', (req, res) => {
 *     if (req.url === '/api/ape/poll') {
 *         if (req.method === 'GET') {
 *             handleStreamGet(req, res)
 *         } else if (req.method === 'POST') {
 *             handleStreamPost(req, res, controllers)
 *         }
 *     }
 * })
 *
 * @example
 * // Controller example (same as WebSocket controllers)
 * // api/users/list.js
 * module.exports = async function(data) {
 *     // 'this' is the context
 *     console.log('Client:', this.clientId)
 *     console.log('User:', this.userId) // From embed
 *
 *     const users = await db.users.find({ limit: data.limit })
 *
 *     // Notify other clients
 *     this.broadcastOthers('users/activity', {
 *         action: 'list',
 *         by: this.userId
 *     })
 *
 *     return users
 * }
 */
function createPostHandler(streamClients) {
  /**
   * HTTP POST request handler for client messages.
   *
   * @param {http.IncomingMessage} req - The HTTP request
   * @param {http.ServerResponse} res - The HTTP response
   * @param {Object<string, Function>} controllers - Map of controller functions
   */
  return function handleStreamPost(req, res, controllers) {
    // Validate client has an active session
    const clientId = getClientId(req);
    if (!clientId) {
      return sendJson(res, 401, {
        error: "Missing session. GET /api/ape/poll first.",
      });
    }

    // Collect request body chunks
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));

    req.on("end", async () => {
      // Parse request body and generate queryId first (needed for error responses too)
      const body = Buffer.concat(chunks).toString("utf8");
      const queryId = messageHash(body);

      try {
        // Parse request body using JSS for rich type support
        const { type: rawType, data } = jss.parse(body);

        // Normalize the type (remove leading slash)
        const type = rawType.replace(/^\//, "");

        // Look up the controller
        const controller = controllers[type];
        if (!controller) {
          return sendJson(res, 404, {
            error: `Controller "${type}" not found`,
          });
        }

        // Get client state for embed values
        const clientState = streamClients.get(clientId);
        const embedValues = clientState?.embed || {};

        // Extract session ID from cookie if present.
        // DEAD `|| ""`: getClientId() above already requires
        // req.headers.cookie to be a non-empty string containing `apeClientId=`
        // (else it returns null and the handler bails with 401 at L226). So
        // by the time control reaches here, `req.headers.cookie` is guaranteed
        // truthy. The fallback is unreachable. To be removed at step 7.
        const sessionIdMatch = (req.headers.cookie /* || "" */).match(
          /(?:^|;\s*)sessionId=([^;]*)/,
        );
        const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

        /**
         * Build the controller context.
         * This matches the WebSocket handler context for consistency.
         * @type {ControllerContext}
         */
        const context = {
          // Core identifiers (can be overridden by embed)
          clientId,
          sessionId,

          // Spread embed values - these take priority over defaults
          ...embedValues,

          // Request object for advanced use cases
          req,

          // Access to all connected clients
          clients,
        };

        // Invoke the controller with context as 'this'
        const result = await controller.call(context, data);

        // Send successful response using JSS for rich type support
        // Include queryId so client can match response to pending request
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(jss.stringify({ data: result, queryId }));
      } catch (err) {
        // Controller threw an error - include queryId for proper error handling
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(jss.stringify({ err: err.message || String(err), queryId }));
      }
    });

    // Handle request errors
    /* istanbul ignore next 3 - request error handler, requires network failure */
    req.on("error", (err) => {
      sendJson(res, 500, { error: err.message });
    });
  };
}

module.exports = {
  /**
   * Creates the POST handler for processing client messages.
   * @function
   */
  createPostHandler,

  /**
   * Extracts client ID from request cookies.
   * Returns null if no client ID cookie is present.
   * @function
   */
  getClientId,

  /**
   * Sends a JSON response with the specified status code.
   * @function
   */
  sendJson,
};
