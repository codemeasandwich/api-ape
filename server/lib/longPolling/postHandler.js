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

const jss = require("../../../utils/jss");
const { errorFrame, dataFrame } = require("../../../utils/wireError");
const { createControllerContext, createCallContext, getSessionId } = require("../../socket/receiveContext");
const messageHash = require("../../../utils/messageHash");
const { hasOwn } = require("../../../utils/safeKeys");
const { DEFAULT_MAX_MESSAGE_BYTES } = require("../options");

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
 * Send an already-serialised JSS frame as the HTTP response.
 *
 * @param {http.ServerResponse} res - Response to write
 * @param {number} statusCode - 200 for a reply, 404 / 500 for an error frame
 * @param {string} frame - JSS text from `dataFrame` / `errorFrame`
 * @returns {void}
 */
function sendFrame(res, statusCode, frame) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(frame);
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
function createPostHandler(streamClients, { maxBodyBytes = DEFAULT_MAX_MESSAGE_BYTES } = {}) {
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

    // Collect request body chunks, up to `maxBodyBytes`: the body is parsed in full before
    // anything checks the endpoint, so an unbounded one lets any client exhaust memory.
    const chunks = [];
    let received = 0;
    let tooBig = false;
    /**
     * Collect one body chunk; past the limit, answer 413 and stop collecting.
     *
     * @param {Buffer} chunk - A piece of the request body
     * @returns {void}
     */
    const onData = (chunk) => {
      received += chunk.length;
      if (received > maxBodyBytes) {
        tooBig = true;
        chunks.length = 0;
        req.off("data", onData); // keep nothing more...
        req.resume(); // ...but drain what the client is still sending
        res.writeHead(413, { "Content-Type": "application/json", Connection: "close" });
        res.end(JSON.stringify({ error: `Request body over ${maxBodyBytes} bytes (maxMessageBytes)` }));
        return;
      }
      chunks.push(chunk);
    };
    req.on("data", onData);

    req.on("end", async () => {
      if (tooBig) return;
      // Parse request body and generate queryId first (needed for error responses too)
      const body = Buffer.concat(chunks).toString("utf8");
      const queryId = messageHash(body);

      try {
        // Parse request body using JSS for rich type support
        const { type: rawType, data } = jss.parse(body);

        // Normalize the type (remove leading slash)
        const type = rawType.replace(/^\//, "");

        // Look up the controller. Own endpoints only: `type` is peer text, and
        // `valueOf` / `constructor` are not controllers just because objects inherit them.
        const controller = hasOwn(controllers, type) ? controllers[type] : undefined;
        if (!controller) {
          // The same error a WebSocket caller gets for an unknown endpoint.
          return sendFrame(res, 404, errorFrame(`TypeError: "${type}" was not found`, false, queryId));
        }

        // Get client state for embed values and the stream to push keepalives on
        const clientState = streamClients.get(clientId);
        const embedValues = clientState?.embed || {};

        // Same session parser as the WebSocket and the stream (`sessionId` cookie, URL-decoded,
        // else the `x-ape-session-id` header).
        const sessionId = getSessionId(req);

        // The same context the WebSocket path builds (broadcast, broadcastOthers,
        // publish, clients, embed ...), and the same per-call layer (keepalive, a
        // private `this.foo`), so a controller behaves the same on either transport.
        // A keepalive is written to the client's SSE stream; the reply is this response.
        const toStream = clientState ? clientState.send : () => {};
        const connection = createControllerContext({
          sharedValues: {
            req,
            agent: clientState?.agent,
            send: (sendType, sendData, sendErr) => toStream(false, sendType, sendData, sendErr),
          },
          embedValues,
          // On this transport an embedded clientId / sessionId has always won (a
          // WebSocket's own identifiers win instead); keep that.
          clientId: hasOwn(embedValues, "clientId") ? embedValues.clientId : clientId,
          sessionId: hasOwn(embedValues, "sessionId") ? embedValues.sessionId : sessionId,
        });
        const context = createCallContext(connection, queryId, toStream);

        // Invoke the controller with context as 'this'
        const result = await controller.call(context, data);

        // Same frame as a WebSocket reply (`undefined` answers with `data<!U>`),
        // with the queryId so the client can match it to the pending request.
        sendFrame(res, 200, dataFrame(result, false, queryId));
      } catch (err) {
        // Same frame as a WebSocket error reply: the Error with its class and message,
        // `errCode` / `errData` beside it, no server stack. See utils/wireError.js.
        sendFrame(res, 500, errorFrame(err, false, queryId));
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
