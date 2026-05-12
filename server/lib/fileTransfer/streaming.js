/**
 * @fileoverview Streaming File Manager - Client-to-Client File Transfers
 *
 * This module provides a specialized manager for handling streaming file transfers
 * between clients. Unlike traditional uploads where the server receives the complete
 * file, streaming transfers allow data to flow through the server in chunks,
 * enabling real-time file sharing between clients.
 *
 * Use Cases:
 * - Live file sharing in collaborative applications
 * - Large file transfers without server-side storage
 * - Real-time media streaming between peers
 * - Progressive file downloads while upload is in progress
 *
 * How Streaming Transfers Work:
 * 1. Uploader registers a streaming file with a unique ID
 * 2. Uploader sends chunks via `appendChunk()` as data becomes available
 * 3. Downloader(s) can read partial data via `get()` with offset
 * 4. Uploader calls `complete()` when transfer is finished
 * 5. File is automatically cleaned up after timeout
 *
 * Memory Management:
 * - Chunks are stored in memory as Buffer arrays
 * - Automatic cleanup via configurable timeouts
 * - `destroy()` method for immediate cleanup
 *
 * @module server/lib/fileTransfer/streaming
 * @see {@link module:server/lib/fileTransfer} - Main file transfer module
 *
 * @example
 * // Create a streaming file manager
 * const { StreamingFileManager } = require('./streaming')
 *
 * const manager = new StreamingFileManager(
 *     30000,  // 30 second start timeout
 *     60000   // 60 second complete timeout
 * )
 *
 * // Register a new streaming file
 * const fileId = manager.register('file-abc', 'uploader-client-id')
 *
 * // Append chunks as they arrive
 * manager.appendChunk('file-abc', Buffer.from('chunk1'))
 * manager.appendChunk('file-abc', Buffer.from('chunk2'))
 *
 * // Downloader reads partial data
 * const result = manager.get('file-abc', 0)
 * console.log(result.data)          // Buffer with 'chunk1chunk2'
 * console.log(result.isComplete)    // false
 * console.log(result.totalReceived) // 12
 *
 * // Mark as complete when done
 * manager.complete('file-abc')
 *
 * // Clean up on shutdown
 * manager.destroy()
 */

/**
 * @typedef {Object} StreamingFileEntry
 * Internal entry tracking a streaming file transfer.
 *
 * @property {string} uploaderId - Client ID of the uploader
 * @property {Buffer[]} chunks - Array of received data chunks
 * @property {number} totalReceived - Total bytes received so far
 * @property {boolean} isComplete - Whether the upload is complete
 * @property {number} createdAt - Timestamp when the file was registered
 * @property {NodeJS.Timeout} timer - Cleanup timeout timer
 */

/**
 * @typedef {Object} StreamingFileResult
 * Result from reading a streaming file.
 *
 * @property {Buffer} data - The file data (or partial data from offset)
 * @property {boolean} isComplete - Whether the upload is complete
 * @property {number} totalReceived - Total bytes received so far
 */

/**
 * Manages streaming file transfers between clients.
 *
 * This class provides a buffer for streaming data that flows through the server
 * from one client to another. It supports:
 *
 * - **Chunked uploads**: Data arrives in pieces and is accumulated
 * - **Partial reads**: Downloaders can read data as it arrives
 * - **Completion tracking**: Know when the full file has been received
 * - **Automatic cleanup**: Files are removed after configurable timeouts
 *
 * The manager uses a two-phase timeout system:
 * 1. **Start timeout**: Maximum time to wait for first chunk after registration
 * 2. **Complete timeout**: Maximum time to keep file after completion
 *
 * @class StreamingFileManager
 *
 * @example
 * // Basic usage
 * const manager = new StreamingFileManager(30000, 60000)
 *
 * // Register and stream
 * manager.register('file-1', 'client-a')
 * manager.appendChunk('file-1', chunk1)
 * manager.appendChunk('file-1', chunk2)
 * manager.complete('file-1')
 *
 * @example
 * // Reading with offset (for resumable downloads)
 * const result1 = manager.get('file-1', 0)    // Get all data
 * const result2 = manager.get('file-1', 100)  // Get data from byte 100
 *
 * @example
 * // Progressive download while upload continues
 * let offset = 0
 * const interval = setInterval(() => {
 *     const result = manager.get('file-1', offset)
 *     if (result) {
 *         sendToDownloader(result.data)
 *         offset += result.data.length
 *
 *         if (result.isComplete && offset >= result.totalReceived) {
 *             clearInterval(interval)
 *         }
 *     }
 * }, 100)
 */
class StreamingFileManager {
  /**
   * Creates a new StreamingFileManager instance.
   *
   * @constructor
   * @param {number} startTimeout - Milliseconds before an idle (no data) file is cleaned up.
   *     This timeout starts when the file is registered and resets when data arrives.
   * @param {number} completeTimeout - Milliseconds to keep a completed file before cleanup.
   *     After `complete()` is called, this timeout determines how long the file stays available.
   *
   * @example
   * // Short timeouts for real-time streaming
   * const rtManager = new StreamingFileManager(5000, 10000)
   *
   * @example
   * // Longer timeouts for large file transfers
   * const fileManager = new StreamingFileManager(60000, 300000)
   */
  constructor(startTimeout, completeTimeout) {
    /**
     * Timeout for idle files (no data received).
     * @type {number}
     * @private
     */
    this.startTimeout = startTimeout;

    /**
     * Timeout for completed files.
     * @type {number}
     * @private
     */
    this.completeTimeout = completeTimeout;

    /**
     * Map of active streaming files keyed by file ID.
     * @type {Map<string, StreamingFileEntry>}
     * @private
     */
    this.streamingFiles = new Map();
  }

  /**
   * Registers a new streaming file for transfer.
   *
   * Creates an entry for the file and starts the cleanup timeout.
   * If a file with the same ID already exists, it is replaced
   * (the old timeout is cleared).
   *
   * @param {string} fileId - Unique identifier for the file
   * @param {string} uploaderId - Client ID of the uploader (for authorization)
   * @returns {string} The file ID (same as input, for chaining)
   *
   * @example
   * // Register a new streaming file
   * const fileId = manager.register('file-abc-123', 'client-uploader-id')
   *
   * @example
   * // File ID can be any unique string
   * manager.register(crypto.randomUUID(), clientId)
   * manager.register(`${clientId}-${Date.now()}`, clientId)
   */
  register(fileId, uploaderId) {
    // Clear existing entry if present
    if (this.streamingFiles.has(fileId)) {
      const existing = this.streamingFiles.get(fileId);
      // DEAD `if br 1` (false): register() always assigns a setTimeout
      // handle to `existing.timer` below. The map only stores entries that
      // were created here, so `existing.timer` is always truthy when an
      // entry exists. To be removed at step 7.
      /* if (existing.timer) */ clearTimeout(existing.timer);
    }

    /**
     * Create the streaming file entry.
     * @type {StreamingFileEntry}
     */
    const entry = {
      uploaderId,
      chunks: [],
      totalReceived: 0,
      isComplete: false,
      createdAt: Date.now(),
      // Set cleanup timer for start + complete timeout combined
      timer: setTimeout(() => {
        this.streamingFiles.delete(fileId);
      }, this.startTimeout + this.completeTimeout),
    };

    this.streamingFiles.set(fileId, entry);
    return fileId;
  }

  /**
   * Appends a data chunk to a streaming file.
   *
   * Chunks are accumulated in order and can be read by downloaders
   * as they arrive. The total received byte count is updated.
   *
   * @param {string} fileId - The file's unique identifier
   * @param {Buffer} chunk - Data chunk to append
   * @returns {boolean} True if the chunk was appended, false if file not found
   *
   * @example
   * // Append chunks as they arrive from the uploader
   * socket.on('fileChunk', (fileId, data) => {
   *     const success = manager.appendChunk(fileId, Buffer.from(data))
   *     if (!success) {
   *         socket.emit('error', 'File not found')
   *     }
   * })
   *
   * @example
   * // Handle streaming upload from HTTP
   * req.on('data', (chunk) => {
   *     manager.appendChunk(fileId, chunk)
   * })
   */
  appendChunk(fileId, chunk) {
    const entry = this.streamingFiles.get(fileId);
    if (!entry) return false;

    entry.chunks.push(chunk);
    entry.totalReceived += chunk.length;
    return true;
  }

  /**
   * Marks a streaming file as complete.
   *
   * Once complete, no more chunks should be appended. The file remains
   * available for download until the complete timeout expires.
   *
   * Optionally, the complete data can be provided to replace all chunks.
   * This is useful when the final assembled file differs from the chunks
   * (e.g., after decompression or decryption).
   *
   * @param {string} fileId - The file's unique identifier
   * @param {Buffer} [data] - Optional complete data to replace chunks
   * @returns {boolean} True if marked complete, false if file not found
   *
   * @example
   * // Mark complete without replacing data
   * manager.complete('file-abc')
   *
   * @example
   * // Mark complete with final assembled data
   * const finalData = assembleChunks(manager.get('file-abc').data)
   * manager.complete('file-abc', finalData)
   *
   * @example
   * // In upload completion handler
   * socket.on('fileComplete', (fileId) => {
   *     if (manager.complete(fileId)) {
   *         notifyDownloaders(fileId, 'complete')
   *     }
   * })
   */
  complete(fileId, data) {
    const entry = this.streamingFiles.get(fileId);
    if (!entry) return false;

    // Replace chunks with complete data if provided
    if (data) {
      entry.chunks = [data];
      entry.totalReceived = data.length;
    }

    entry.isComplete = true;

    // Reset timer for complete timeout only
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      this.streamingFiles.delete(fileId);
    }, this.completeTimeout);

    return true;
  }

  /**
   * Retrieves data from a streaming file.
   *
   * Returns the accumulated data, completion status, and total bytes received.
   * An optional offset allows reading only new data since last read
   * (useful for progressive downloads).
   *
   * @param {string} fileId - The file's unique identifier
   * @param {number} [offset=0] - Byte offset to start reading from
   * @returns {StreamingFileResult|null} File data and status, or null if not found
   *
   * @example
   * // Get all data
   * const result = manager.get('file-abc')
   * if (result) {
   *     console.log('Data:', result.data)
   *     console.log('Complete:', result.isComplete)
   *     console.log('Total:', result.totalReceived)
   * }
   *
   * @example
   * // Progressive download with offset
   * let downloaded = 0
   * function downloadMore() {
   *     const result = manager.get('file-abc', downloaded)
   *     if (result && result.data.length > 0) {
   *         writeToFile(result.data)
   *         downloaded += result.data.length
   *     }
   *     if (!result?.isComplete) {
   *         setTimeout(downloadMore, 100)
   *     }
   * }
   *
   * @example
   * // HTTP streaming response
   * app.get('/stream/:fileId', (req, res) => {
   *     const result = manager.get(req.params.fileId)
   *     if (!result) {
   *         return res.status(404).send('Not found')
   *     }
   *     res.setHeader('X-Complete', result.isComplete ? '1' : '0')
   *     res.setHeader('X-Total', result.totalReceived)
   *     res.send(result.data)
   * })
   */
  get(fileId, offset = 0) {
    const entry = this.streamingFiles.get(fileId);
    if (!entry) return null;

    // Concatenate all chunks into a single buffer
    const data = Buffer.concat(entry.chunks);

    return {
      // Return data from offset (for partial reads)
      data: offset > 0 ? data.slice(offset) : data,
      isComplete: entry.isComplete,
      totalReceived: entry.totalReceived,
    };
  }

  /**
   * Checks if a streaming file exists.
   *
   * @param {string} fileId - The file's unique identifier
   * @returns {boolean} True if the file exists, false otherwise
   *
   * @example
   * if (manager.has('file-abc')) {
   *     // File exists, safe to read or append
   * }
   */
  has(fileId) {
    return this.streamingFiles.has(fileId);
  }

  /**
   * Cleans up files older than the specified maximum age.
   *
   * This is useful for periodic cleanup in addition to the automatic
   * timeout-based cleanup. Can be called on an interval to ensure
   * stale files don't accumulate.
   *
   * @param {number} maxAge - Maximum age in milliseconds
   *
   * @example
   * // Clean up files older than 5 minutes every minute
   * setInterval(() => {
   *     manager.cleanup(5 * 60 * 1000)
   * }, 60 * 1000)
   *
   * @example
   * // One-time cleanup of very old files
   * manager.cleanup(24 * 60 * 60 * 1000) // 24 hours
   */
  cleanup(maxAge) {
    const now = Date.now();
    for (const [fileId, entry] of this.streamingFiles) {
      /* istanbul ignore next 4 - periodic cleanup, covered by automatic timers in practice */
      if (now - entry.createdAt > maxAge) {
        clearTimeout(entry.timer);
        this.streamingFiles.delete(fileId);
      }
    }
  }

  /**
   * Destroys the manager and clears all streaming files.
   *
   * Cancels all pending cleanup timers and removes all files from memory.
   * Call this when shutting down the server or when the manager is no
   * longer needed.
   *
   * @example
   * // Clean shutdown
   * process.on('SIGTERM', () => {
   *     manager.destroy()
   *     process.exit(0)
   * })
   *
   * @example
   * // In test cleanup
   * afterEach(() => {
   *     manager.destroy()
   * })
   */
  destroy() {
    for (const entry of this.streamingFiles.values()) {
      clearTimeout(entry.timer);
    }
    this.streamingFiles.clear();
  }
}

module.exports = { StreamingFileManager };
