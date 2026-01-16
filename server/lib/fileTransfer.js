/**
 * @fileoverview Binary File Transfer Manager for api-ape Server
 *
 * This module provides the infrastructure for handling binary data transfers
 * between clients and the server. It manages temporary storage of binary data
 * that is too large or inappropriate to send directly through WebSocket messages.
 *
 * ## Architecture Overview
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                      FileTransferManager                                │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐   │
 * │  │  pendingDownloads │  │  pendingUploads   │  │  _streaming       │   │
 * │  │      (Map)        │  │      (Map)        │  │  (StreamingFile   │   │
 * │  │                   │  │                   │  │   Manager)        │   │
 * │  │ Server → Client   │  │ Client → Server   │  │ Client → Client   │   │
 * │  │ binary transfers  │  │ binary uploads    │  │ file sharing      │   │
 * │  └───────────────────┘  └───────────────────┘  └───────────────────┘   │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Transfer Types
 *
 * ### 1. Downloads (Server → Client)
 *
 * When a controller returns binary data, it's registered as a pending download:
 * 1. Controller returns `{ image: Buffer.from(...) }`
 * 2. Binary data is extracted and registered with `registerDownload()`
 * 3. Response is sent with hash reference: `{ "image<!L>": "abc123" }`
 * 4. Client fetches binary via `GET /api/ape/data/abc123`
 * 5. Entry is cleaned up after download or timeout
 *
 * ### 2. Uploads (Client → Server)
 *
 * When a client sends binary data in a request:
 * 1. Client sends message with tagged reference: `{ "file<!A>": "xyz789" }`
 * 2. Server calls `registerUpload()` which returns a Promise
 * 3. Client uploads binary via `PUT /api/ape/data/{queryId}/xyz789`
 * 4. `receiveUpload()` resolves the Promise with the data
 * 5. Controller receives the actual binary data
 *
 * ### 3. Streaming (Client → Client)
 *
 * For client-to-client file sharing:
 * 1. Sender registers file with `registerStreamingFile()`
 * 2. Sender uploads data (possibly in chunks)
 * 3. Receiver fetches via `getStreamingFile()`
 * 4. Auto-cleanup after timeout
 *
 * ## Security
 *
 * - Session host ID validation ensures only the intended recipient can access data
 * - Automatic cleanup prevents storage exhaustion
 * - Timeout limits prevent indefinite resource holding
 *
 * ## Timeouts
 *
 * | Timeout         | Default | Description                                    |
 * |-----------------|---------|------------------------------------------------|
 * | `startTimeout`  | 60s     | Time allowed before transfer must begin        |
 * | `completeTimeout`| 60s    | Time allowed to complete after transfer starts |
 *
 * @module server/lib/fileTransfer
 * @see {@link module:server/socket/send} for download registration
 * @see {@link module:server/socket/receive} for upload handling
 * @see {@link module:server/lib/fileTransfer/streaming} for client-to-client transfers
 *
 * @example <caption>Controller returning binary data</caption>
 * // api/images.js
 * module.exports = async function(data) {
 *   const imageBuffer = await loadImage(data.imageId)
 *
 *   // Returning a Buffer automatically triggers download registration
 *   return {
 *     name: 'photo.jpg',
 *     image: imageBuffer  // Will become { "image<!L>": "hash" }
 *   }
 * }
 *
 * @example <caption>Controller receiving binary upload</caption>
 * // api/upload.js
 * module.exports = async function(data) {
 *   // data.file is already a Buffer (hydrated from upload)
 *   const { file, filename } = data
 *
 *   await saveFile(filename, file)
 *   return { success: true, size: file.length }
 * }
 */

const { StreamingFileManager } = require("./fileTransfer/streaming");

/**
 * Default timeout before a transfer must start (milliseconds)
 * @constant {number}
 * @default 60000
 */
const DEFAULT_START_TIMEOUT = 60 * 1000;

/**
 * Default timeout to complete a transfer after it starts (milliseconds)
 * @constant {number}
 * @default 60000
 */
const DEFAULT_COMPLETE_TIMEOUT = 60 * 1000;

/**
 * @typedef {Object} DownloadEntry
 * @description Internal structure for tracking pending downloads
 * @property {Buffer|ArrayBuffer} data - The binary data to be downloaded
 * @property {string} contentType - MIME type of the data
 * @property {string} sessionHostId - Client ID authorized to download
 * @property {number} createdAt - Timestamp when entry was created
 * @property {boolean} downloadStarted - Whether download has begun
 * @property {NodeJS.Timeout} timer - Cleanup timeout handle
 */

/**
 * @typedef {Object} UploadEntry
 * @description Internal structure for tracking pending uploads
 * @property {string} sessionHostId - Client ID authorized to upload
 * @property {number} createdAt - Timestamp when entry was created
 * @property {Function} resolver - Promise resolve function
 * @property {Function} rejector - Promise reject function
 * @property {Buffer|null} data - Received data (null until uploaded)
 * @property {NodeJS.Timeout} timer - Timeout handle
 */

/**
 * @typedef {Object} FileTransferOptions
 * @description Configuration options for FileTransferManager
 * @property {number} [startTimeout=60000] - Milliseconds before transfer must start
 * @property {number} [completeTimeout=60000] - Milliseconds to complete after starting
 */

/**
 * Manages temporary binary data storage for file transfers
 *
 * This class handles the lifecycle of binary data that passes through the
 * api-ape server. It provides separate handling for:
 * - Downloads: Server sending binary data to clients
 * - Uploads: Clients sending binary data to server
 * - Streaming: Client-to-client file sharing
 *
 * All transfers are temporary with automatic cleanup via timeouts and
 * periodic garbage collection.
 *
 * @class FileTransferManager
 *
 * @example
 * // Create with custom timeouts
 * const manager = new FileTransferManager({
 *   startTimeout: 30000,      // 30 seconds to start
 *   completeTimeout: 120000   // 2 minutes to complete
 * })
 *
 * @example
 * // Register a download
 * const hash = manager.registerDownload(
 *   'uniqueHash',
 *   imageBuffer,
 *   'image/png',
 *   clientId
 * )
 *
 * // Later, client requests the download
 * const result = manager.getDownload('uniqueHash', clientId)
 * if (result) {
 *   response.setHeader('Content-Type', result.contentType)
 *   response.send(result.data)
 * }
 */
class FileTransferManager {
  /**
   * Create a new FileTransferManager instance
   *
   * @param {FileTransferOptions} [options={}] - Configuration options
   * @param {number} [options.startTimeout=60000] - Time allowed before transfer starts
   * @param {number} [options.completeTimeout=60000] - Time allowed to complete transfer
   *
   * @example
   * // Default timeouts (60 seconds each)
   * const manager = new FileTransferManager()
   *
   * @example
   * // Custom timeouts
   * const manager = new FileTransferManager({
   *   startTimeout: 30000,
   *   completeTimeout: 300000
   * })
   */
  constructor(options = {}) {
    /**
     * Timeout before transfer must start (milliseconds)
     * @type {number}
     */
    this.startTimeout = options.startTimeout || DEFAULT_START_TIMEOUT;

    /**
     * Timeout to complete transfer after starting (milliseconds)
     * @type {number}
     */
    this.completeTimeout = options.completeTimeout || DEFAULT_COMPLETE_TIMEOUT;

    /**
     * Map of pending downloads: hash → DownloadEntry
     * @type {Map<string, DownloadEntry>}
     * @private
     */
    this.pendingDownloads = new Map();

    /**
     * Map of pending uploads: "queryId/pathHash" → UploadEntry
     * @type {Map<string, UploadEntry>}
     * @private
     */
    this.pendingUploads = new Map();

    /**
     * Streaming file manager for client-to-client transfers
     * @type {StreamingFileManager}
     * @private
     */
    this._streaming = new StreamingFileManager(
      this.startTimeout,
      this.completeTimeout,
    );

    /**
     * Interval timer for periodic cleanup
     * @type {NodeJS.Timeout}
     * @private
     */
    this._cleanupInterval = setInterval(() => this._cleanup(), 30000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Streaming File Methods (Client-to-Client)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a new streaming file for client-to-client transfer
   *
   * Creates an entry for a file that will be uploaded by one client
   * and downloaded by another. The file can be uploaded in chunks.
   *
   * @param {string} fileId - Unique identifier for the file
   * @param {string} uploaderId - Client ID of the uploader
   * @returns {string} The fileId (for chaining)
   *
   * @example
   * // Register file for sharing
   * manager.registerStreamingFile('file123', 'clientABC')
   *
   * // Sender uploads the file
   * // ... upload happens via HTTP PUT ...
   *
   * // Receiver fetches the file
   * const file = manager.getStreamingFile('file123')
   */
  registerStreamingFile(fileId, uploaderId) {
    return this._streaming.register(fileId, uploaderId);
  }

  /**
   * Append a chunk of data to a streaming file
   *
   * Used for chunked uploads where the file is sent in multiple parts.
   *
   * @param {string} fileId - The file identifier
   * @param {Buffer} chunk - Data chunk to append
   * @returns {boolean} True if successful, false if file not found
   *
   * @example
   * // Chunked upload
   * manager.appendChunk('file123', chunk1)
   * manager.appendChunk('file123', chunk2)
   * manager.appendChunk('file123', chunk3)
   * manager.completeStreamingUpload('file123')
   */
  appendChunk(fileId, chunk) {
    return this._streaming.appendChunk(fileId, chunk);
  }

  /**
   * Mark a streaming file upload as complete
   *
   * Optionally accepts final data to replace any chunked data.
   * After completion, the file is available for download.
   *
   * @param {string} fileId - The file identifier
   * @param {Buffer} [data] - Optional complete file data (replaces chunks)
   * @returns {boolean} True if successful, false if file not found
   *
   * @example
   * // Complete with final data (replaces any chunks)
   * manager.completeStreamingUpload('file123', completeBuffer)
   *
   * @example
   * // Complete chunked upload (uses accumulated chunks)
   * manager.completeStreamingUpload('file123')
   */
  completeStreamingUpload(fileId, data) {
    return this._streaming.complete(fileId, data);
  }

  /**
   * Get a streaming file for download
   *
   * Retrieves the file data, optionally starting from an offset
   * (useful for resuming interrupted downloads).
   *
   * @param {string} fileId - The file identifier
   * @param {number} [offset=0] - Byte offset to start from
   * @returns {{data: Buffer, isComplete: boolean, totalReceived: number}|null}
   *          File data and status, or null if not found
   *
   * @example
   * const file = manager.getStreamingFile('file123')
   * if (file) {
   *   res.setHeader('Content-Type', 'application/octet-stream')
   *   res.setHeader('X-Complete', file.isComplete ? '1' : '0')
   *   res.send(file.data)
   * }
   *
   * @example
   * // Resume from offset
   * const file = manager.getStreamingFile('file123', 1024)
   * // file.data contains bytes starting from offset 1024
   */
  getStreamingFile(fileId, offset = 0) {
    return this._streaming.get(fileId, offset);
  }

  /**
   * Check if a streaming file exists
   *
   * @param {string} fileId - The file identifier to check
   * @returns {boolean} True if the file exists in streaming storage
   *
   * @example
   * if (manager.isStreamingFile(hash)) {
   *   // Handle as streaming file
   * } else {
   *   // Handle as regular download
   * }
   */
  isStreamingFile(fileId) {
    return this._streaming.has(fileId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Download Handling (Server → Client)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register binary data for download by a client
   *
   * Called by the send handler when a controller returns binary data.
   * The data is stored temporarily and can be retrieved via HTTP GET.
   *
   * ## Timeout Behavior
   *
   * 1. Entry created with `startTimeout` timer
   * 2. If download starts before timeout, timer is replaced with `completeTimeout`
   * 3. If download doesn't start in time, entry is deleted
   * 4. After download starts, entry persists for `completeTimeout` duration
   *
   * @param {string} hash - Unique identifier for this download
   * @param {Buffer|ArrayBuffer} data - Binary data to make available
   * @param {string} [contentType='application/octet-stream'] - MIME type
   * @param {string} sessionHostId - Client ID authorized to download
   * @returns {string} The hash (for use in response)
   *
   * @example
   * // Register image data for download
   * const hash = FileTransferManager.generateHash(queryId, 'avatar')
   * manager.registerDownload(hash, imageBuffer, 'image/png', clientId)
   *
   * // Send reference to client: { "avatar<!L>": hash }
   *
   * @example
   * // Re-registering with same hash replaces existing entry
   * manager.registerDownload('hash123', newData, 'text/plain', clientId)
   */
  registerDownload(hash, data, contentType, sessionHostId) {
    // Clear existing entry if present
    if (this.pendingDownloads.has(hash)) {
      const existing = this.pendingDownloads.get(hash);
      if (existing.timer) clearTimeout(existing.timer);
    }

    /**
     * Download entry structure
     * @type {DownloadEntry}
     */
    const entry = {
      data,
      contentType: contentType || "application/octet-stream",
      sessionHostId,
      createdAt: Date.now(),
      downloadStarted: false,
      timer: setTimeout(() => {
        // Clean up if download never started
        if (!this.pendingDownloads.get(hash)?.downloadStarted) {
          this.pendingDownloads.delete(hash);
        }
      }, this.startTimeout),
    };

    this.pendingDownloads.set(hash, entry);
    return hash;
  }

  /**
   * Retrieve binary data for a download request
   *
   * Called by the HTTP handler when a client requests a download.
   * Validates the requesting client matches the authorized session.
   *
   * ## Security
   *
   * - Only the client that received the hash reference can download
   * - Session host ID must match exactly
   * - Returns null for unauthorized requests (no error details leaked)
   *
   * @param {string} hash - The download identifier
   * @param {string} requestingHostId - Client ID making the request
   * @returns {{data: Buffer|ArrayBuffer, contentType: string}|null}
   *          Download data and content type, or null if not found/unauthorized
   *
   * @example
   * // In HTTP GET handler
   * const result = manager.getDownload(hash, clientId)
   *
   * if (!result) {
   *   res.status(404).json({ error: 'Download not found or unauthorized' })
   *   return
   * }
   *
   * res.setHeader('Content-Type', result.contentType)
   * res.setHeader('Content-Length', result.data.length)
   * res.send(result.data)
   */
  getDownload(hash, requestingHostId) {
    const entry = this.pendingDownloads.get(hash);

    // Not found
    if (!entry) return null;

    // Unauthorized - different client
    if (entry.sessionHostId !== requestingHostId) return null;

    // First access - switch to completion timeout
    if (!entry.downloadStarted) {
      entry.downloadStarted = true;
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        this.pendingDownloads.delete(hash);
      }, this.completeTimeout);
    }

    return { data: entry.data, contentType: entry.contentType };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Upload Handling (Client → Server)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register expectation of an incoming upload
   *
   * Called when a message contains tagged binary references. Returns a
   * Promise that resolves when the client uploads the actual data.
   *
   * ## Flow
   *
   * 1. Server receives message with `{ "file<!A>": "hash123" }`
   * 2. `registerUpload()` is called, returns Promise
   * 3. Client uploads binary data to `PUT /api/ape/data/{queryId}/hash123`
   * 4. `receiveUpload()` is called with the data
   * 5. Promise resolves with the binary data
   * 6. Controller receives hydrated data with actual Buffer
   *
   * @param {string} queryId - Message query ID this upload belongs to
   * @param {string} pathHash - Property path hash identifying the upload
   * @param {string} sessionHostId - Client ID expected to upload
   * @returns {Promise<Buffer>} Resolves with uploaded data, rejects on timeout
   *
   * @example
   * // In receive handler
   * const uploadPromise = manager.registerUpload(queryId, 'abc123', clientId)
   *
   * try {
   *   const data = await uploadPromise
   *   // data is now the uploaded Buffer
   * } catch (err) {
   *   // Upload timed out
   * }
   */
  registerUpload(queryId, pathHash, sessionHostId) {
    const key = `${queryId}/${pathHash}`;

    return new Promise((resolve, reject) => {
      /**
       * Upload entry structure
       * @type {UploadEntry}
       */
      const entry = {
        sessionHostId,
        createdAt: Date.now(),
        resolver: resolve,
        rejector: reject,
        data: null,
        timer: setTimeout(() => {
          this.pendingUploads.delete(key);
          reject(new Error(`Upload timeout: ${key}`));
        }, this.startTimeout),
      };

      this.pendingUploads.set(key, entry);
    });
  }

  /**
   * Receive uploaded binary data
   *
   * Called by the HTTP handler when a client uploads data.
   * Validates the client and resolves the waiting Promise.
   *
   * @param {string} queryId - Message query ID
   * @param {string} pathHash - Property path hash
   * @param {Buffer} data - The uploaded binary data
   * @param {string} requestingHostId - Client ID making the upload
   * @returns {boolean} True if upload was accepted, false otherwise
   *
   * @example
   * // In HTTP PUT handler
   * const success = manager.receiveUpload(queryId, pathHash, bodyBuffer, clientId)
   *
   * if (success) {
   *   res.json({ success: true })
   * } else {
   *   res.status(404).json({ error: 'Upload not expected or unauthorized' })
   * }
   */
  receiveUpload(queryId, pathHash, data, requestingHostId) {
    const key = `${queryId}/${pathHash}`;
    const entry = this.pendingUploads.get(key);

    // Not found - no upload expected
    if (!entry) return false;

    // Unauthorized - different client
    if (entry.sessionHostId !== requestingHostId) return false;

    // Clear timeout and resolve Promise
    clearTimeout(entry.timer);
    entry.resolver(data);
    this.pendingUploads.delete(key);

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Static Utilities
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a hash for binary data reference
   *
   * Creates a short, deterministic hash from a query ID and property path.
   * Used to create unique identifiers for binary data in messages.
   *
   * @param {string} queryId - The message query identifier
   * @param {string} propertyPath - Dot-notation path to the property (e.g., 'user.avatar')
   * @returns {string} Base-36 encoded hash string
   * @static
   *
   * @example
   * const hash = FileTransferManager.generateHash('q123abc', 'image')
   * // hash: 'k7m3np' (example)
   *
   * @example
   * // Nested property
   * const hash = FileTransferManager.generateHash('q123abc', 'user.profile.avatar')
   * // hash: 'x9w2qr' (example)
   */
  static generateHash(queryId, propertyPath) {
    const combined = `${queryId}:${propertyPath}`;
    let hash = 0;

    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Periodic cleanup of expired entries
   *
   * Called every 30 seconds to remove entries that have exceeded
   * the maximum age (startTimeout + completeTimeout).
   *
   * @private
   */
  _cleanup() {
    const now = Date.now();
    const maxAge = this.startTimeout + this.completeTimeout;

    // Clean up expired downloads
    for (const [hash, entry] of this.pendingDownloads) {
      if (now - entry.createdAt > maxAge) {
        clearTimeout(entry.timer);
        this.pendingDownloads.delete(hash);
      }
    }

    // Clean up expired uploads (reject their promises)
    for (const [key, entry] of this.pendingUploads) {
      if (now - entry.createdAt > maxAge) {
        clearTimeout(entry.timer);
        entry.rejector(new Error(`Upload expired: ${key}`));
        this.pendingUploads.delete(key);
      }
    }

    // Delegate to streaming manager
    this._streaming.cleanup(maxAge);
  }

  /**
   * Destroy the manager and clean up all resources
   *
   * Should be called when shutting down the server to prevent
   * memory leaks and ensure timers are cleared.
   *
   * @example
   * // On server shutdown
   * process.on('SIGTERM', () => {
   *   fileTransferManager.destroy()
   *   server.close()
   * })
   */
  destroy() {
    // Stop periodic cleanup
    clearInterval(this._cleanupInterval);

    // Clear all download timers
    for (const entry of this.pendingDownloads.values()) {
      clearTimeout(entry.timer);
    }

    // Clear all upload timers
    for (const entry of this.pendingUploads.values()) {
      clearTimeout(entry.timer);
    }

    // Clear maps
    this.pendingDownloads.clear();
    this.pendingUploads.clear();

    // Destroy streaming manager
    this._streaming.destroy();
  }
}

/**
 * Singleton instance of FileTransferManager
 *
 * Created on first access via getFileTransferManager().
 *
 * @type {FileTransferManager|null}
 * @private
 */
let instance = null;

/**
 * Get the singleton FileTransferManager instance
 *
 * Creates the instance on first call with the provided options.
 * Subsequent calls return the same instance (options are ignored).
 *
 * This singleton pattern ensures all parts of api-ape share the
 * same file transfer state.
 *
 * @param {FileTransferOptions} [options] - Configuration options (only used on first call)
 * @returns {FileTransferManager} The singleton instance
 *
 * @example
 * // First call - creates instance with options
 * const manager = getFileTransferManager({
 *   startTimeout: 30000,
 *   completeTimeout: 120000
 * })
 *
 * // Subsequent calls - returns same instance
 * const sameManager = getFileTransferManager()
 * console.log(manager === sameManager)  // true
 *
 * @example
 * // Usage in api-ape initialization
 * const fileTransfer = getFileTransferManager(options.fileTransferOptions)
 */
function getFileTransferManager(options) {
  if (!instance) {
    instance = new FileTransferManager(options);
  }
  return instance;
}

/**
 * Reset the singleton FileTransferManager instance (for test cleanup)
 *
 * Calls destroy() on the existing instance to clear intervals and pending
 * transfers, then sets the singleton to null so a new instance can be created.
 */
function resetFileTransferManager() {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

module.exports = {
  /**
   * FileTransferManager class
   *
   * Use this for creating custom instances or type checking.
   * For normal usage, use getFileTransferManager() instead.
   *
   * @type {typeof FileTransferManager}
   */
  FileTransferManager,

  /**
   * Get the singleton FileTransferManager instance
   *
   * @type {function(FileTransferOptions=): FileTransferManager}
   */
  getFileTransferManager,

  /**
   * Reset the singleton instance (for test cleanup)
   *
   * @type {function(): void}
   */
  resetFileTransferManager,
};
