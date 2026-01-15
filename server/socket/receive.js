/**
 * @fileoverview WebSocket Message Receive Handler for api-ape Server
 *
 * This module handles incoming WebSocket messages from clients. It parses
 * messages, routes them to the appropriate controller, processes binary
 * data uploads, and sends responses back to the client.
 *
 * ## Message Processing Flow
 *
 * ```
 * Incoming WebSocket Message
 *         │
 *         ▼
 * ┌───────────────────────────────────────────────────────────────┐
 * │  Parse message with JSS                                       │
 * │  - Extract: type, data, createdAt                             │
 * │  - Generate queryId from message hash                         │
 * └───────────────────────────────────────────────────────────────┘
 *         │
 *         ▼
 * ┌───────────────────────────────────────────────────────────────┐
 * │  Process Binary Upload Tags                                   │
 * │  - Find <!A> and <!B> tagged properties                       │
 * │  - Register upload expectations                               │
 * │  - Wait for HTTP uploads to complete                          │
 * │  - Replace hashes with actual binary data                     │
 * └───────────────────────────────────────────────────────────────┘
 *         │
 *         ▼
 * ┌───────────────────────────────────────────────────────────────┐
 * │  Process File Share Tags                                      │
 * │  - Find <!F> tagged properties                                │
 * │  - Register streaming file expectations                       │
 * └───────────────────────────────────────────────────────────────┘
 *         │
 *         ▼
 * ┌───────────────────────────────────────────────────────────────┐
 * │  Route to Controller                                          │
 * │  - Normalize type to lowercase endpoint path                  │
 * │  - Find matching controller function                          │
 * │  - Validate request (replay protection)                       │
 * │  - Call controller with processed data                        │
 * └───────────────────────────────────────────────────────────────┘
 *         │
 *         ▼
 * ┌───────────────────────────────────────────────────────────────┐
 * │  Send Response                                                │
 * │  - Success: Send result with queryId                          │
 * │  - Error: Send error message with queryId                     │
 * │  - Call onFinish/onReceive callbacks                          │
 * └───────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Message Format
 *
 * Incoming messages (from client):
 * ```json
 * {
 *   "type": "/users",
 *   "data": { "action": "list" },
 *   "createdAt": "2024-01-01T00:00:00.000Z"
 * }
 * ```
 *
 * Response messages (to client):
 * ```json
 * {
 *   "queryId": "K7M3NP2Q",
 *   "data": { "users": [...] }
 * }
 * ```
 *
 * Error response:
 * ```json
 * {
 *   "queryId": "K7M3NP2Q",
 *   "err": "Controller not found: users"
 * }
 * ```
 *
 * ## Binary Data Handling
 *
 * When a message contains binary data references (tagged with <!A> or <!B>):
 * 1. Tags are detected and extracted from the data
 * 2. Upload expectations are registered with FileTransferManager
 * 3. Handler waits for client to upload binary via HTTP PUT
 * 4. Once uploaded, the Promise resolves with the actual data
 * 5. Controller receives the hydrated data with real Buffers
 *
 * @module server/socket/receive
 * @see {@link module:server/socket/send} for outgoing message handling
 * @see {@link module:server/lib/wiring} for connection setup
 * @see {@link module:server/lib/fileTransfer} for binary data handling
 *
 * @example <caption>How messages are processed</caption>
 * // Client sends:
 * api.users({ action: 'list', filter: { active: true } })
 *
 * // Server receives (after JSS parsing):
 * {
 *   type: '/users',
 *   data: { action: 'list', filter: { active: true } },
 *   createdAt: Date
 * }
 *
 * // Routed to: controllers['users']
 * // Called as: controllers['users'].call(context, data)
 *
 * @example <caption>Binary upload handling</caption>
 * // Client sends message with binary reference:
 * {
 *   type: '/upload',
 *   data: { 'file<!A>': 'hash123', filename: 'doc.pdf' }
 * }
 *
 * // Server:
 * // 1. Detects <!A> tag
 * // 2. Registers upload for 'hash123'
 * // 3. Waits for HTTP PUT /api/ape/data/{queryId}/hash123
 * // 4. Once uploaded, controller receives:
 * //    { file: Buffer(...), filename: 'doc.pdf' }
 */

const messageHash = require("../../utils/messageHash");
const { broadcast, clients } = require("../lib/broadcast");
const jss = require("../../utils/jss");
const {
  findUploadTags,
  findFileTags,
  cleanUploadTags,
  setValueAtPath,
} = require("./tagUtils");

/**
 * Extract session ID from request cookies
 *
 * Looks for a cookie named 'sessionId' in the HTTP request headers.
 * This session ID is typically set by the outer web framework
 * (Express, Koa, etc.) during initial authentication.
 *
 * @param {http.IncomingMessage} req - The HTTP request object
 * @returns {string|null} The session ID if found, null otherwise
 * @private
 *
 * @example
 * // With cookie: "sessionId=abc123; other=value"
 * getSessionId(req)  // Returns: 'abc123'
 *
 * // Without sessionId cookie
 * getSessionId(req)  // Returns: null
 */
function getSessionId(req) {
  const cookies = req?.headers?.cookie || "";
  const match = cookies.match(/(?:^|;\s*)sessionId=([^;]*)/);
  return match ? match[1] : null;
}

/**
 * Create a message receive handler for a WebSocket connection
 *
 * This factory function creates a handler that processes all incoming
 * WebSocket messages for a specific client connection. The handler is
 * bound to the connection's context (ape object) which includes:
 * - Socket reference and request info
 * - Client identification (clientId, sessionId)
 * - Controller functions
 * - Event callbacks (onReceive, onSend, onError)
 * - Embedded values from onConnect
 * - File transfer manager
 *
 * @param {Object} ape - The connection context object
 * @param {Function} ape.send - Function to send messages to this client
 * @param {Function} ape.checkReply - Replay attack prevention checker
 * @param {Object} ape.events - Event handler callbacks
 * @param {Function} ape.events.onReceive - Called when message is received
 * @param {Function} ape.events.onSend - Called when message is sent
 * @param {Function} ape.events.onError - Called on errors
 * @param {Object} ape.controllers - Loaded controller functions
 * @param {Object} ape.sharedValues - Shared values (socket, req, agent, send)
 * @param {string} ape.clientId - Unique client identifier
 * @param {Object} ape.embedValues - Custom values from onConnect
 * @param {Object} [ape.fileTransfer] - File transfer manager instance
 * @returns {Function} Async function that handles incoming messages
 *
 * @example
 * // Created internally by wiring.js
 * const handler = receiveHandler(apeContext)
 * socket.on('message', handler)
 *
 * @example
 * // Handler processes messages like:
 * handler('{"type":"/ping","data":{},"createdAt":"2024-01-01T00:00:00.000Z"}')
 */
module.exports = function receiveHandler(ape) {
  const {
    send,
    checkReply,
    events,
    controllers,
    sharedValues,
    clientId,
    embedValues,
    fileTransfer,
  } = ape;

  /**
   * Extract session ID from the original HTTP upgrade request
   * @type {string|null}
   */
  const sessionId = getSessionId(sharedValues.req);

  /**
   * Context object bound to `this` in controller invocations
   *
   * Controllers can access these values using `this.propertyName`.
   * Includes both shared values, embed values, and utility functions.
   *
   * @type {Object}
   * @property {WebSocket} socket - The WebSocket instance
   * @property {http.IncomingMessage} req - Original HTTP request
   * @property {Object} agent - Parsed user-agent information
   * @property {Function} send - Send message to this client
   * @property {Function} broadcast - Broadcast to all clients
   * @property {Function} broadcastOthers - Broadcast excluding this client
   * @property {Map} clients - Map of all connected clients
   * @property {string} clientId - This client's unique identifier
   * @property {string|null} sessionId - Session ID from cookies
   * @property {...*} embedValues - Custom values from onConnect
   */
  const that = {
    ...sharedValues,
    ...embedValues,
    /**
     * Broadcast a message to all connected clients
     * @param {string} type - Message type
     * @param {any} data - Data to broadcast
     */
    broadcast: (type, data) => broadcast(type, data),
    /**
     * Broadcast to all clients except this one
     * @param {string} type - Message type
     * @param {any} data - Data to broadcast
     */
    broadcastOthers: (type, data) => broadcast(type, data, clientId),
    /**
     * Map of all connected clients (read-only)
     */
    clients,
    clientId,
    sessionId,
  };

  /**
   * Handle an incoming WebSocket message
   *
   * This is the main message processing function. It:
   * 1. Parses the message from JSS format
   * 2. Processes any binary upload tags
   * 3. Routes to the appropriate controller
   * 4. Sends the response (success or error)
   *
   * @param {string|Buffer} msg - Raw message from WebSocket
   * @returns {Promise<void>}
   * @async
   *
   * @example
   * // Message flow for a simple request
   * await onReceive('{"type":"/users","data":{"action":"list"}}')
   * // 1. Parses message
   * // 2. Calls controllers['users']({ action: 'list' })
   * // 3. Sends response with result
   */
  return async function onReceive(msg) {
    /**
     * Convert message to string if it's a Buffer
     * @type {string}
     */
    const msgString = typeof msg === "string" ? msg : msg.toString("utf8");

    /**
     * Generate unique query ID from message content
     * Used for request/response correlation
     * @type {string}
     */
    const queryId = messageHash(msgString);

    try {
      /**
       * Find binary upload tags BEFORE JSS parsing
       *
       * JSS decode strips unknown tags like <!B> and <!A>, so we need to
       * extract upload information from the raw JSON first.
       */
      const rawParsed = JSON.parse(msgString);
      const rawData = rawParsed.data;

      /**
       * Parse the JSS-encoded message
       * Extracts type (endpoint), data (payload), and createdAt (timestamp)
       */
      const { type: rawType, data, createdAt } = jss.parse(msgString);

      /**
       * Normalize the type/endpoint path
       * - Remove leading slash
       * - Convert to lowercase
       * @type {string}
       */
      const type = rawType.replace(/^\//, "").toLowerCase();

      /**
       * Call onReceive event handler
       * May return a function to call when processing completes
       * @type {Function|undefined}
       */
      const onFinish = events.onReceive(queryId, data, type) || (() => {});

      /**
       * Process binary upload tags in the data
       *
       * If the data contains tagged binary references (<!A> or <!B>),
       * register upload expectations and wait for the actual data.
       * NOTE: We use rawData (from JSON.parse) because JSS strips upload tags.
       */
      let processedData = data;

      if (fileTransfer && rawData) {
        /**
         * Find all upload-tagged properties from raw JSON
         * @type {Array<{path: string, hash: string, tag: string}>}
         */
        const uploadTags = findUploadTags(rawData);

        if (uploadTags.length > 0) {
          // Clean the tags from keys (rename 'file<!A>' to 'file')
          processedData = cleanUploadTags(data);

          try {
            /**
             * Wait for all binary uploads to complete
             *
             * For each tagged property:
             * 1. Register an upload expectation
             * 2. Wait for client to HTTP PUT the data
             * 3. Set the actual binary data at the property path
             */
            await Promise.all(
              uploadTags.map(async ({ path, hash }) => {
                const uploadData = await fileTransfer.registerUpload(
                  queryId,
                  hash,
                  clientId,
                );
                setValueAtPath(processedData, path, uploadData);
              }),
            );
          } catch (uploadErr) {
            // Upload failed (timeout or error) - send error response
            try {
              send(queryId, false, false, uploadErr);
            } catch (sendErr) {
              // Socket likely closed - ignore
            }
            if (typeof onFinish === "function") onFinish(uploadErr, true);
            return;
          }
        }

        /**
         * Process file sharing tags (<!F>)
         *
         * These indicate files that will be shared between clients.
         * Register the streaming file so it can receive the upload.
         */
        const fileTags = findFileTags(rawData);
        if (fileTags.length > 0) {
          fileTags.forEach(({ hash }) =>
            fileTransfer.registerStreamingFile(hash, clientId),
          );
        }
      }

      /**
       * Execute the controller and handle the result
       *
       * Wraps controller execution in a Promise for uniform handling
       * of both sync and async controllers.
       */
      const result = new Promise((resolve, reject) => {
        try {
          /**
           * Find the controller for this endpoint
           * @type {Function|undefined}
           */
          const controller = controllers[type];

          if (!controller) {
            throw `TypeError: "${type}" was not found`;
          }

          /**
           * Validate the request (replay protection)
           * Throws if request is duplicate or too old
           */
          checkReply(queryId, createdAt);

          /**
           * Call the controller with the processed data
           * Controller is called with `that` bound to `this`
           */
          resolve(controller.call(that, processedData));
        } catch (err) {
          reject(err);
        }
      });

      /**
       * Handle controller result
       *
       * Note: send() may throw if socket is closed during processing.
       * We catch these errors silently since the client is already gone.
       */
      result
        .then((val) => {
          // Only send response if controller returned a value
          if (undefined !== val) {
            try {
              send(queryId, false, val, false);
            } catch (sendErr) {
              // Socket likely closed during processing - ignore
            }
          }
          if (typeof onFinish === "function") onFinish(false, val);
        })
        .catch((err) => {
          // Send error response
          try {
            send(queryId, false, false, err);
          } catch (sendErr) {
            // Socket likely closed during processing - ignore
          }
          if (typeof onFinish === "function") onFinish(err, true);
        });
    } catch (err) {
      /**
       * Handle parsing errors or other unexpected errors
       * Calls the onError event handler
       */
      events.onError(clientId, queryId, err.message || err);
    }
  };
};
