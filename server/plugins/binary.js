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
 * | `L` | Server→Client   | Link to downloadable binary data               |
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
   * L tag: Server → Client downloads
   *
   * When a controller returns binary data (Buffer, ArrayBuffer, TypedArray),
   * this plugin:
   * 1. Registers the data as a pending download
   * 2. Replaces the value with a hash reference
   * 3. Client fetches via HTTP GET /api/ape/data/{hash}
   */
  jss.custom("L", {
    // Check if value is binary data that should be sent as download
    check: (key, value) => isBinaryData(value),

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
};
