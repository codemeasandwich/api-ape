/**
 * @fileoverview Long Polling Handler - HTTP Fallback for WebSocket
 *
 * This module provides HTTP long-polling as a fallback transport when WebSocket
 * connections are not available. Long polling is essential for:
 *
 * - Clients behind restrictive firewalls that block WebSocket
 * - Networks that don't support WebSocket protocol
 * - Legacy browser support
 * - Debugging and testing scenarios
 *
 * How Long Polling Works:
 * 1. Client makes a GET request that is held open (streaming response)
 * 2. Server sends events to client by writing to the response stream
 * 3. Client sends messages via POST requests
 * 4. Heartbeats keep the connection alive
 * 5. Connection is recycled periodically to prevent timeouts
 *
 * This module coordinates the GET and POST handlers and maintains
 * the client state map shared between them.
 *
 * @module server/lib/longPolling
 * @see {@link module:server/lib/longPolling/getHandler} - GET handler for streaming responses
 * @see {@link module:server/lib/longPolling/postHandler} - POST handler for client messages
 * @see {@link module:server/lib/wiring} - WebSocket wiring (primary transport)
 *
 * @example
 * // Create long polling handlers for api-ape server
 * const { createLongPollingHandler } = require('./longPolling')
 *
 * const { handleStreamGet, handleStreamPost, getStreamClients } = createLongPollingHandler(
 *     controllers,
 *     onConnect,
 *     fileTransfer
 * )
 *
 * // Use in HTTP server
 * server.on('request', (req, res) => {
 *     if (req.url === '/api/ape/poll' && req.method === 'GET') {
 *         handleStreamGet(req, res)
 *     } else if (req.url === '/api/ape/poll' && req.method === 'POST') {
 *         handleStreamPost(req, res, controllers)
 *     }
 * })
 *
 * @example
 * // Monitor connected clients
 * const { getStreamClients } = createLongPollingHandler(controllers, onConnect, fileTransfer)
 *
 * setInterval(() => {
 *     console.log(`Long polling clients: ${getStreamClients().size}`)
 * }, 10000)
 */

const {
  createGetHandler,
  ensureClientId,
} = require("./longPolling/getHandler");
const { createPostHandler, getClientId } = require("./longPolling/postHandler");

/**
 * Map of active long-polling client connections.
 *
 * Keyed by client ID (from cookie), values contain:
 * - res: HTTP response stream
 * - messageQueue: Pending messages
 * - heartbeatTimer: Interval timer for keepalives
 * - isActive: Whether the connection is still active
 * - embed: Custom data attached during onConnect
 * - onDisconnect: Cleanup callback
 *
 * @private
 * @type {Map<string, Object>}
 */
const streamClients = new Map();

/**
 * @typedef {Object} LongPollingHandlers
 * Object containing the HTTP handlers for long polling.
 *
 * @property {Function} handleStreamGet - GET request handler for streaming responses.
 *     Creates a long-lived HTTP response that streams events to the client.
 * @property {Function} handleStreamPost - POST request handler for client messages.
 *     Processes messages sent by clients and routes to controllers.
 * @property {Function} getStreamClients - Returns the Map of active stream clients.
 *     Useful for monitoring and debugging.
 */

/**
 * Creates the long polling HTTP handlers.
 *
 * This function sets up the GET and POST handlers that work together
 * to provide bidirectional communication over HTTP:
 *
 * **GET Handler (Streaming Receive)**:
 * - Client opens a long-lived HTTP connection
 * - Server streams JSON events to the response
 * - Heartbeats sent every 20 seconds to keep connection alive
 * - Connection recycled after 25 seconds (client reconnects)
 *
 * **POST Handler (Send Messages)**:
 * - Client sends JSON messages via POST
 * - Messages are routed to appropriate controllers
 * - Response contains the controller's return value
 *
 * Both handlers share the `streamClients` Map to coordinate state.
 *
 * @function createLongPollingHandler
 * @param {Object<string, Function>} controllers - Map of controller functions keyed by endpoint
 * @param {Function} [onConnect] - Optional callback when a client connects.
 *     Receives (socket, req, send) and can return { onDisconnect, embed }.
 * @param {import('./fileTransfer').FileTransferManager} fileTransfer - File transfer manager
 * @returns {LongPollingHandlers} Object with handleStreamGet, handleStreamPost, and getStreamClients
 *
 * @example
 * // Basic setup
 * const handlers = createLongPollingHandler(controllers, null, fileTransfer)
 *
 * // In request handler
 * if (pathname === '/api/ape/poll') {
 *     if (req.method === 'GET') {
 *         handlers.handleStreamGet(req, res)
 *     } else if (req.method === 'POST') {
 *         handlers.handleStreamPost(req, res, controllers)
 *     }
 * }
 *
 * @example
 * // With connection callback
 * const handlers = createLongPollingHandler(
 *     controllers,
 *     async (socket, req, send) => {
 *         // Authenticate user
 *         const user = await authenticate(req)
 *
 *         // Send welcome message
 *         send('welcome', { userId: user.id })
 *
 *         return {
 *             embed: { userId: user.id },
 *             onDisconnect: () => {
 *                 console.log(`User ${user.id} disconnected`)
 *             }
 *         }
 *     },
 *     fileTransfer
 * )
 *
 * @example
 * // Monitoring active connections
 * const { getStreamClients } = createLongPollingHandler(controllers, onConnect, fileTransfer)
 *
 * // Get count of active long-polling clients
 * const activeCount = getStreamClients().size
 *
 * // Iterate over clients
 * for (const [clientId, state] of getStreamClients()) {
 *     console.log(`Client ${clientId}: active=${state.isActive}`)
 * }
 */
function createLongPollingHandler(controllers, onConnect, fileTransfer) {
  /**
   * GET handler for streaming responses.
   * Creates a long-lived HTTP response that streams events to the client.
   * @type {Function}
   */
  const handleStreamGet = createGetHandler(streamClients, onConnect);

  /**
   * POST handler for client messages.
   * Processes incoming messages and routes them to controllers.
   * @type {Function}
   */
  const handleStreamPost = createPostHandler(streamClients);

  return {
    handleStreamGet,
    handleStreamPost,
    /**
     * Returns the Map of active stream clients.
     * @returns {Map<string, Object>} The stream clients Map
     */
    getStreamClients: () => streamClients,
  };
}

module.exports = {
  /**
   * Create long polling handlers for HTTP fallback transport.
   * @function
   */
  createLongPollingHandler,

  /**
   * Extract client ID from request cookies (POST handler utility).
   * Returns null if no client ID cookie is present.
   * @function
   * @param {http.IncomingMessage} req - The HTTP request
   * @returns {string|null} The client ID or null
   */
  getClientId,

  /**
   * Get or create a client ID from request/response (GET handler utility).
   * Sets a cookie if no client ID exists.
   * @function
   * @param {http.IncomingMessage} req - The HTTP request
   * @param {http.ServerResponse} res - The HTTP response
   * @returns {string} The client ID
   */
  ensureClientId,
};
