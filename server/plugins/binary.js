/**
 * @fileoverview Binary Data Transfer Plugins for JSS
 *
 * This module provides plugins for handling binary data transfer in api-ape.
 * It moves the binary handling logic from hardcoded server code into the
 * pluggable JSS system.
 *
 * ## Plugin Tags
 *
 * | Tag | Direction       | Description                                    |
 * |-----|-----------------|------------------------------------------------|
 * | `I` | Server→Client   | Inline base64 for small binary (<=100 chars)   |
 * | `L` | Server→Client   | Link to downloadable binary data (large)       |
 * | `B` | Client→Server   | Buffer upload (resolves to Buffer)             |
 * | `A` | Client→Server   | ArrayBuffer upload (resolves to ArrayBuffer)   |
 * | `F` | Client→Client   | Streaming file transfer                        |
 *
 * ## Usage
 *
 * ```javascript
 * const { registerBinaryPlugins } = require('./plugins/binary')
 *
 * // During server initialization
 * registerBinaryPlugins()
 * ```
 *
 * @module server/plugins/binary
 * @see {@link module:utils/jss/plugins} for plugin system
 * @see {@link module:server/lib/fileTransfer} for file transfer management
 */

const jss = require("../../utils/jss");

/**
 * Maximum size in base64 characters for inline binary encoding
 * Data up to this size will be inlined as base64 in the message.
 * Larger data will use HTTP transfer (L tag).
 *
 * 100 base64 chars ≈ 75 raw bytes
 * @constant {number}
 */
const INLINE_BASE64_THRESHOLD = 100;

/**
 * Check if a value is binary data
 *
 * @param {any} value - Value to check
 * @returns {boolean} True if value is Buffer, ArrayBuffer, or TypedArray
 * @private
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
 * Get the base64 encoded length for binary data
 *
 * @param {Buffer|ArrayBuffer|ArrayBufferView} value - Binary data
 * @returns {number} Length when encoded as base64
 * @private
 */
function getBase64Length(value) {
  let byteLength;
  if (Buffer.isBuffer(value)) {
    byteLength = value.length;
  } else if (value instanceof ArrayBuffer) {
    byteLength = value.byteLength;
  } else if (ArrayBuffer.isView(value)) {
    byteLength = value.byteLength;
  } else {
    return Infinity; // Unknown type, use HTTP transfer
  }
  // Base64 encoding increases size by ~33%
  return Math.ceil((byteLength * 4) / 3);
}

/**
 * Register binary data plugins for server-side use
 *
 * Call this during server initialization to enable binary transfer
 * functionality through the JSS plugin system.
 *
 * @example
 * const { registerBinaryPlugins } = require('./plugins/binary')
 * registerBinaryPlugins()
 *
 * // Now binary data in controller responses will be handled automatically
 * // Controller: return { image: Buffer.from(...) }
 * // Client receives: { 'image<!L>': 'hash123' }
 */
function registerBinaryPlugins() {
  const { FileTransferManager } = require("../lib/fileTransfer");

  /**
   * I tag: Inline base64 for small binary data
   *
   * For small binary data (<=100 base64 chars / ~75 bytes):
   * 1. Converts to base64 inline in the message
   * 2. No HTTP transfer required - reduces latency
   *
   * NOTE: Must be registered BEFORE L tag so it's checked first
   */
  jss.custom("I", {
    // Check if value is SMALL binary data that should be inlined
    check: (key, value) => {
      if (!isBinaryData(value)) return false;
      return getBase64Length(value) <= INLINE_BASE64_THRESHOLD;
    },

    // Encode: convert to base64 string
    encode: (path, key, value, context) => {
      const buffer = Buffer.isBuffer(value)
        ? value
        : Buffer.from(
            value instanceof ArrayBuffer
              ? value
              : value.buffer.slice(
                  value.byteOffset,
                  value.byteOffset + value.byteLength,
                ),
          );
      return buffer.toString("base64");
    },

    // Decode: handled by built-in I decoder in decode.js
    decode: (value, path, context) => Buffer.from(value, "base64"),

    // No onSend needed - data is inlined, no HTTP transfer
  });

  /**
   * L tag: Server → Client downloads
   *
   * When a controller returns LARGE binary data (Buffer, ArrayBuffer, TypedArray),
   * this plugin:
   * 1. Registers the data as a pending download
   * 2. Replaces the value with a hash reference
   * 3. Client fetches via HTTP GET /api/ape/data/{hash}
   *
   * NOTE: Small binary data is handled by I tag (inline base64)
   */
  jss.custom("L", {
    // Check if value is LARGE binary data that should be sent as download
    check: (key, value) => {
      if (!isBinaryData(value)) return false;
      return getBase64Length(value) > INLINE_BASE64_THRESHOLD;
    },

    // Encode: return placeholder (actual value set by onSend)
    encode: (path, key, value, context) => "__pending__",

    // Decode: on client side, the hash is returned as-is
    // Client will fetch the actual data via HTTP
    decode: (value, path, context) => value,

    // onSend: register the binary data for HTTP download
    onSend: (path, key, value, context) => {
      const pathStr = path.length > 0 ? path.join(".") : "root";
      const hash = FileTransferManager.generateHash(context.queryId, pathStr);

      // Detect content type (could be enhanced with magic number detection)
      const contentType = "application/octet-stream";

      // Register for HTTP download
      context.fileTransfer.registerDownload(
        hash,
        value,
        contentType,
        context.clientId,
      );

      return { replace: hash };
    },
  });

  /**
   * B tag: Client → Server Buffer uploads
   *
   * When a client sends binary data with <!B> tag:
   * 1. Server registers an upload expectation
   * 2. Client uploads via HTTP PUT /api/ape/data/{queryId}/{hash}
   * 3. onReceive resolves with the uploaded Buffer
   */
  jss.custom("B", {
    // Check: B tags come from client, we don't check server-side values
    check: () => false,

    // Encode: not used (B is client→server only)
    encode: (path, key, value, context) => value,

    // Decode: the hash value is decoded as-is, actual data set by onReceive
    decode: (value, path, context) => value,

    // onReceive: wait for the binary upload
    onReceive: async (path, key, hash, context) => {
      const uploadData = await context.fileTransfer.registerUpload(
        context.queryId,
        hash,
        context.clientId,
      );
      return uploadData;
    },
  });

  /**
   * A tag: Client → Server ArrayBuffer uploads
   *
   * Same as B tag but returns ArrayBuffer instead of Buffer.
   */
  jss.custom("A", {
    // Check: A tags come from client, we don't check server-side values
    check: () => false,

    // Encode: not used (A is client→server only)
    encode: (path, key, value, context) => value,

    // Decode: the hash value is decoded as-is, actual data set by onReceive
    decode: (value, path, context) => value,

    // onReceive: wait for the binary upload, convert to ArrayBuffer
    onReceive: async (path, key, hash, context) => {
      const uploadData = await context.fileTransfer.registerUpload(
        context.queryId,
        hash,
        context.clientId,
      );
      // Convert Buffer to ArrayBuffer
      return uploadData.buffer.slice(
        uploadData.byteOffset,
        uploadData.byteOffset + uploadData.byteLength,
      );
    },
  });

  /**
   * F tag: Client → Client streaming file transfers
   *
   * Used for peer-to-peer file sharing between clients.
   * The server acts as an intermediary, streaming data from
   * sender to receiver without storing the entire file.
   */
  jss.custom("F", {
    // Check: F tags come from client, we don't check server-side values
    check: () => false,

    // Encode: pass through (F tags are managed by client)
    encode: (path, key, value, context) => value,

    // Decode: pass through
    decode: (value, path, context) => value,

    // onReceive: register streaming file expectation
    onReceive: async (path, key, hash, context) => {
      // Register the streaming file to receive uploads
      context.fileTransfer.registerStreamingFile(hash, context.clientId);
      // Return the hash - actual streaming happens via HTTP
      return hash;
    },
  });
}

/**
 * Check if binary plugins are currently registered
 *
 * @returns {boolean} True if the L plugin is registered
 */
function areBinaryPluginsRegistered() {
  const { hasPlugin } = require("../../utils/jss/plugins");
  return hasPlugin("L");
}

module.exports = {
  registerBinaryPlugins,
  areBinaryPluginsRegistered,
  isBinaryData,
  INLINE_BASE64_THRESHOLD,
};
