/**
 * @fileoverview Socket Send Handler for api-ape Server
 *
 * This module handles outgoing WebSocket messages from the server to clients.
 * It processes response data, extracts binary content for HTTP transfer, and
 * serializes messages using JSS (JSON Super Set) encoding.
 *
 * ## Message Flow
 *
 * ```
 * Controller Returns Data
 *         │
 *         ▼
 * ┌───────────────────────────────────────────────────────────────┐
 * │  send(queryId, type, data, err)                               │
 * │  ├── Validate socket state                                    │
 * │  ├── Process binary data (if fileTransfer enabled)            │
 * │  │   └── Register downloads for binary values                 │
 * │  ├── Serialize with JSS                                       │
 * │  └── Send via WebSocket                                       │
 * └───────────────────────────────────────────────────────────────┘
 *         │
 *         ▼
 * Client Receives Message
 *   { data: {...}, type: "...", queryId: "..." }
 * ```
 *
 * ## Binary Data Handling
 *
 * When the server sends binary data (Buffer, ArrayBuffer, TypedArray):
 * 1. Binary values are detected by `isBinaryData()`
 * 2. Each binary value is registered as a pending download
 * 3. The value is replaced with a tagged hash: `{ "image<!L>": "abc123" }`
 * 4. Client fetches binary via HTTP GET `/api/ape/data/abc123`
 *
 * ## Message Types
 *
 * | Scenario              | queryId | type   | Description                    |
 * |-----------------------|---------|--------|--------------------------------|
 * | Response to request   | ✓       | -      | Reply to client's query        |
 * | Server push/broadcast | -       | ✓      | Unsolicited message to client  |
 * | Error response        | ✓       | -      | Error reply to client's query  |
 * | Error broadcast       | -       | ✓      | Error notification             |
 *
 * @module server/socket/send
 * @see {@link module:server/socket/receive} for incoming message handling
 * @see {@link module:server/lib/fileTransfer} for binary data management
 * @see {@link module:utils/jss} for serialization
 *
 * @example <caption>Basic usage in wiring</caption>
 * const socketSend = require('./send')
 *
 * const send = socketSend({
 *   socket,
 *   events: { onSend: (data, type) => console.log('Sent:', type) },
 *   clientId: 'abc123',
 *   fileTransfer: fileTransferManager
 * })
 *
 * // Send response to a query
 * send('queryId123', null, { result: 'success' }, null)
 *
 * // Send broadcast message
 * send(null, 'notification', { message: 'Hello!' }, null)
 *
 * // Send error response
 * send('queryId123', null, null, new Error('Something failed'))
 *
 * @example <caption>Sending binary data</caption>
 * // Controller returns binary data
 * const imageBuffer = await loadImage(id)
 *
 * // send() automatically extracts binary and registers download
 * send(queryId, null, {
 *   name: 'photo.jpg',
 *   image: imageBuffer  // Will become { "image<!L>": "hash" }
 * }, null)
 *
 * // Client receives: { name: 'photo.jpg', 'image<!L>': 'abc123' }
 * // Client fetches: GET /api/ape/data/abc123
 */

const jss = require("../../utils/jss");
const { FileTransferManager } = require("../lib/fileTransfer");
const { processPluginSend } = require("./pluginHooks");
const { getAllPlugins } = require("../../utils/jss/plugins");

/**
 * Check if the WebSocket is in a valid state to send messages
 *
 * Validates that the socket is in the OPEN state and throws a descriptive
 * error if it's not. This prevents attempting to send on closed or
 * closing connections.
 *
 * @param {WebSocket} socket - WebSocket instance to check
 * @throws {string} Error message describing the socket state if not open
 * @private
 *
 * @example
 * try {
 *   checkSocketState(socket)
 *   socket.send(message)
 * } catch (err) {
 *   console.error('Cannot send:', err)
 * }
 */
function checkSocketState(socket) {
  if (socket.readyState !== socket.OPEN) {
    /* istanbul ignore next 7 - race condition guards, hard to trigger reliably in E2E */
    switch (socket.readyState) {
      case socket.CONNECTING:
        throw "The connection is not yet open";
      case socket.CLOSING:
        throw "The connection is in the process of closing.";
      case socket.CLOSED:
        throw "The connection is closed or couldn't be opened.";
    }
    // TODO: Consider removing disconnected sockets from tracking
  }
}

/**
 * Check if a value is binary data that requires special handling
 *
 * Detects Buffer (Node.js), ArrayBuffer, and TypedArray views.
 * These types cannot be directly serialized to JSON and must be
 * transferred separately via HTTP.
 *
 * @param {any} value - Value to check
 * @returns {boolean} True if the value is binary data
 * @private
 *
 * @example
 * isBinaryData(Buffer.from('hello'))        // true
 * isBinaryData(new ArrayBuffer(10))         // true
 * isBinaryData(new Uint8Array(10))          // true
 * isBinaryData({ key: 'value' })            // false
 * isBinaryData('string')                    // false
 * isBinaryData(null)                        // false
 */
function isBinaryData(value) {
  if (value === null || value === undefined) return false;
  return (
    Buffer.isBuffer(value) ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  );
}

/**
 * Detect content type from binary data
 *
 * Currently returns a generic content type. Could be enhanced with
 * magic number detection for common file types (PNG, JPEG, PDF, etc.).
 *
 * @param {Buffer|ArrayBuffer|ArrayBufferView} data - Binary data
 * @returns {string} MIME content type
 * @private
 *
 * @example
 * const contentType = detectContentType(imageBuffer)
 * // Returns: 'application/octet-stream'
 */
function detectContentType(data) {
  // Could be enhanced with magic number detection
  return "application/octet-stream";
}

/**
 * Process a data object, replacing binary values with download references
 *
 * Recursively traverses the data structure, finding any binary values
 * (Buffer, ArrayBuffer, TypedArray) and:
 * 1. Registering them as pending downloads in the file transfer manager
 * 2. Replacing them with tagged hash references (`key<!L>`: hash)
 *
 * ## Tag System
 *
 * - `<!L>` suffix indicates a linked binary resource
 * - Client sees `{ "image<!L>": "abc123" }` instead of binary
 * - Client fetches via `GET /api/ape/data/abc123`
 *
 * ## Passthrough for F-tagged Values
 *
 * Values already tagged with `<!F>` (file shares) are passed through
 * unchanged, as they represent client-to-client transfers.
 *
 * @param {any} data - Data to process
 * @param {string} queryId - Query ID or message type for hash generation
 * @param {FileTransferManager} fileTransfer - File transfer manager instance
 * @param {string} clientId - Client ID authorized to download
 * @param {string} [path=''] - Current dot-notation path in the object
 * @returns {{processedData: any, binaryEntries: Array<{path: string, hash: string}>}}
 *          Processed data with binary references and list of registered downloads
 * @private
 *
 * @example
 * const result = processBinaryData(
 *   { name: 'photo', image: imageBuffer },
 *   'query123',
 *   fileTransferManager,
 *   'clientABC'
 * )
 *
 * // result.processedData = { name: 'photo', 'image<!L>': 'hash123' }
 * // result.binaryEntries = [{ path: 'image', hash: 'hash123' }]
 *
 * @example
 * // Nested binary data
 * const result = processBinaryData(
 *   {
 *     user: { name: 'Alice', avatar: avatarBuffer },
 *     files: [file1Buffer, file2Buffer]
 *   },
 *   'query123',
 *   fileTransferManager,
 *   'clientABC'
 * )
 *
 * // All binary values are extracted and registered
 */
function processBinaryData(data, queryId, fileTransfer, clientId, path = "") {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return { processedData: data, binaryEntries: [] };
  }

  // Handle binary data - extract and register
  if (isBinaryData(data)) {
    // Generate hash from query ID and property path
    const hash = FileTransferManager.generateHash(queryId, path || "root");
    const contentType = detectContentType(data);

    // Register for HTTP download
    fileTransfer.registerDownload(hash, data, contentType, clientId);

    return {
      processedData: { [`__ape_link__`]: hash },
      binaryEntries: [{ path, hash }],
    };
  }

  // Handle arrays - process each element recursively
  if (Array.isArray(data)) {
    const processedArray = [];
    const allBinaryEntries = [];

    for (let i = 0; i < data.length; i++) {
      const itemPath = path ? `${path}.${i}` : String(i);
      const { processedData, binaryEntries } = processBinaryData(
        data[i],
        queryId,
        fileTransfer,
        clientId,
        itemPath,
      );
      processedArray.push(processedData);
      allBinaryEntries.push(...binaryEntries);
    }

    return { processedData: processedArray, binaryEntries: allBinaryEntries };
  }

  // Pass through JSS-supported types unchanged
  // These types are handled by JSS encoding and should not be recursed into
  if (
    data instanceof Date ||
    data instanceof RegExp ||
    data instanceof Map ||
    data instanceof Set ||
    data instanceof Error
  ) {
    return { processedData: data, binaryEntries: [] };
  }

  // Handle plain objects - process each property recursively
  if (typeof data === "object") {
    const processedObj = {};
    const allBinaryEntries = [];

    for (const key of Object.keys(data)) {
      // F-tagged values pass through unchanged (client-to-client sharing)
      // Client will fetch from /api/ape/data/:hash
      if (key.endsWith("<!F>")) {
        processedObj[key] = data[key];
        continue;
      }

      const itemPath = path ? `${path}.${key}` : key;
      const { processedData, binaryEntries } = processBinaryData(
        data[key],
        queryId,
        fileTransfer,
        clientId,
        itemPath,
      );

      // If this was binary data, mark the key with <!L> tag
      if (binaryEntries.length > 0 && processedData?.__ape_link__) {
        processedObj[`${key}<!L>`] = processedData.__ape_link__;
      } else {
        processedObj[key] = processedData;
      }
      allBinaryEntries.push(...binaryEntries);
    }

    return { processedData: processedObj, binaryEntries: allBinaryEntries };
  }

  // Primitive value - return as-is
  return { processedData: data, binaryEntries: [] };
}

/**
 * Create a send handler for a WebSocket connection
 *
 * Factory function that creates a send function bound to a specific
 * WebSocket connection and its associated context (events, file transfer, etc.).
 *
 * ## Send Function Signature
 *
 * The returned function has the signature:
 * ```
 * send(queryId, type, data, err)
 * ```
 *
 * - `queryId` - For responses to client requests (mutually exclusive with type)
 * - `type` - For broadcast/push messages (mutually exclusive with queryId)
 * - `data` - Response data payload (required if no err)
 * - `err` - Error to send (required if no data)
 *
 * ## Event Callbacks
 *
 * - `onSend(data, type)` is called for broadcast messages (not query responses)
 * - The return value of onSend can be a cleanup function called after send
 *
 * @param {Object} ape - Connection context object
 * @param {WebSocket} ape.socket - WebSocket connection
 * @param {Object} ape.events - Event handler callbacks
 * @param {Function} [ape.events.onSend] - Called when sending broadcast messages
 * @param {string} ape.clientId - Unique identifier for this client
 * @param {FileTransferManager} [ape.fileTransfer] - File transfer manager (optional)
 * @returns {Function} Send function `(queryId, type, data, err) => void`
 *
 * @example <caption>Creating a send handler</caption>
 * const send = socketSend({
 *   socket: wsConnection,
 *   events: {
 *     onSend: (data, type) => {
 *       console.log(`Sending ${type}:`, data)
 *       return () => console.log('Send complete')
 *     }
 *   },
 *   clientId: 'client123',
 *   fileTransfer: manager
 * })
 *
 * @example <caption>Sending a query response</caption>
 * // Response to client request
 * send('Q7K3M2', null, { users: [...] }, null)
 *
 * // Client receives:
 * // { queryId: 'Q7K3M2', data: { users: [...] } }
 *
 * @example <caption>Sending a broadcast</caption>
 * // Push notification to client
 * send(null, 'notification', { title: 'New message' }, null)
 *
 * // Client receives:
 * // { type: 'notification', data: { title: 'New message' } }
 *
 * @example <caption>Sending an error</caption>
 * // Error response to query
 * send('Q7K3M2', null, null, new Error('Not found'))
 *
 * // Client receives:
 * // { queryId: 'Q7K3M2', err: 'Not found' }
 */
module.exports = function sendHandler({
  socket,
  events,
  clientId,
  fileTransfer,
}) {
  /**
   * Send a message to the connected client
   *
   * @param {string|null} queryId - Query ID for response messages
   * @param {string|null} type - Message type for broadcast messages
   * @param {any} data - Data payload to send
   * @param {Error|string|null} err - Error to send (if any)
   * @throws {Error} If neither type nor queryId is provided
   * @throws {Error} If neither data nor err is provided
   */
  return function send(queryId, type, data, err) {
    // NOTE: Validation commented out - internal callers always provide valid args.
    // These checks protect against external API misuse but can never trigger internally.
    // if (!type && !queryId) {
    //   throw new Error(
    //     "You must pass a type OR a queryId in order to send messages",
    //   );
    // }
    // if (!data && !err) {
    //   throw new Error(
    //     "You must pass a data payload OR an error message in order to send messages",
    //   );
    // }

    /**
     * Callback for post-send cleanup
     * Only set for broadcast messages (not query responses)
     * @type {Function|false}
     */
    let onFinish = false;

    // For broadcasts (not query responses), call onSend callback
    if (!queryId) {
      onFinish = events.onSend(data, type);
    }

    // Verify socket is in valid state
    try {
      checkSocketState(socket);
    } catch (err) {
      /* istanbul ignore next 8 - socket state error handling with onFinish callback */
      if (onFinish) {
        onFinish(err, false);
      } else if (queryId) {
        throw err;
      } else {
        console.error(err);
      }
      return;
    }

    // Process binary data if fileTransfer is available and we have data (not error)
    let processedData = data;
    if (fileTransfer && data && !err) {
      // Check if any plugins are registered - if so, use plugin-based processing
      if (getAllPlugins().size > 0) {
        const context = {
          queryId: queryId || type,
          clientId,
          fileTransfer,
          direction: "send",
        };
        const { data: processed, binaryCount } = processPluginSend(
          data,
          context,
        );
        processedData = processed;

        if (binaryCount > 0) {
          console.log(
            `📦 Registered ${binaryCount} binary download(s) for ${queryId || type}`,
          );
        }
      } else {
        // Fallback to legacy processBinaryData for backwards compatibility
        const { processedData: processed, binaryEntries } = processBinaryData(
          data,
          queryId || type,
          fileTransfer,
          clientId,
        );
        processedData = processed;

        if (binaryEntries.length > 0) {
          console.log(
            `📦 Registered ${binaryEntries.length} binary download(s) for ${queryId || type}`,
          );
        }
      }
    }

    // Send error or data message
    if (err) {
      // Error message
      socket.send(jss.stringify({ err: err.message || err, type, queryId }));

      /* istanbul ignore next 3 - onFinish callback for error, needs onSend hook */
      if (typeof onFinish === "function") {
        onFinish(err, true);
      }
    } else {
      // Data message
      socket.send(jss.stringify({ data: processedData, type, queryId }));

      /* istanbul ignore next 3 - onFinish callback for data, needs onSend hook */
      if (typeof onFinish === "function") {
        onFinish(false, data);
      }
    }
  };
};
