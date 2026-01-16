/**
 * @fileoverview Upload Tag Utilities for Socket Receive Handler
 *
 * This module provides utilities for detecting and processing special binary data
 * tags in api-ape messages. The tag system enables binary data (files, ArrayBuffers)
 * to be referenced in JSON messages and transferred separately via HTTP.
 *
 * Tag Types:
 * - `<!B>` (Buffer): Client will upload binary data (Buffer/ArrayBuffer)
 * - `<!A>` (ArrayBuffer): Client will upload an ArrayBuffer
 * - `<!F>` (File): References a file for streaming client-to-client transfer
 * - `<!L>` (Link): Server returns a download link for binary data
 *
 * Data Flow:
 * 1. Client sends message with tagged keys: `{ "image<!B>": "hash123" }`
 * 2. Server extracts upload tags using `findUploadTags()`
 * 3. Server waits for binary data upload via HTTP PUT
 * 4. Server cleans tags and injects actual data using `cleanUploadTags()`
 * 5. Controller receives clean object: `{ image: <Buffer> }`
 *
 * @module server/socket/tagUtils
 * @see {@link module:server/socket/receive} - Socket receive handler using these utilities
 * @see {@link module:server/lib/fileTransfer} - File transfer management
 *
 * @example
 * const { findUploadTags, cleanUploadTags, setValueAtPath } = require('./tagUtils')
 *
 * // Message from client with binary upload tag
 * const message = { "avatar<!B>": "abc123", name: "Alice" }
 *
 * // Find all upload tags
 * const uploads = findUploadTags(message)
 * // [{ path: 'avatar', hash: 'abc123', tag: 'B', originalKey: 'avatar<!B>' }]
 *
 * // After receiving the binary data, clean the object
 * const cleaned = cleanUploadTags(message)
 * // { avatar: 'abc123', name: 'Alice' }
 *
 * // Inject the actual binary data
 * setValueAtPath(cleaned, 'avatar', actualBuffer)
 * // { avatar: <Buffer ...>, name: 'Alice' }
 */

/**
 * @typedef {Object} UploadTag
 * Represents a detected upload tag in a message object.
 *
 * @property {string} path - Dot-notation path to the value (e.g., 'user.profile.avatar')
 * @property {string} hash - The hash/identifier for the upload
 * @property {'B'|'A'} tag - Tag type: 'B' for Buffer, 'A' for ArrayBuffer
 * @property {string} originalKey - The original key including the tag (e.g., 'avatar<!B>')
 */

/**
 * @typedef {Object} FileTag
 * Represents a detected file tag for streaming transfers.
 *
 * @property {string} path - Dot-notation path to the value
 * @property {string} hash - The file identifier/hash
 * @property {string} originalKey - The original key including the tag
 */

/**
 * Recursively finds all upload tags (`<!B>` and `<!A>`) in an object.
 *
 * Traverses the object tree and identifies keys ending with `<!B>` or `<!A>`,
 * which indicate that the client will upload binary data for that field.
 *
 * The function handles:
 * - Nested objects: `{ user: { "avatar<!B>": "hash" } }` → path: 'user.avatar'
 * - Arrays: `{ files: [{ "data<!B>": "h1" }, { "data<!B>": "h2" }] }` → paths: 'files.0.data', 'files.1.data'
 * - Multiple tags at any level
 *
 * @function findUploadTags
 * @param {Object} obj - The object to search for upload tags
 * @param {string} [path=''] - Current path prefix (used in recursion)
 * @returns {UploadTag[]} Array of detected upload tags with their paths and metadata
 *
 * @example
 * // Simple upload tag
 * const uploads = findUploadTags({ "image<!B>": "hash123" })
 * // [{ path: 'image', hash: 'hash123', tag: 'B', originalKey: 'image<!B>' }]
 *
 * @example
 * // Nested upload tags
 * const uploads = findUploadTags({
 *     user: {
 *         "avatar<!B>": "hash1",
 *         profile: {
 *             "banner<!A>": "hash2"
 *         }
 *     }
 * })
 * // [
 * //   { path: 'user.avatar', hash: 'hash1', tag: 'B', originalKey: 'avatar<!B>' },
 * //   { path: 'user.profile.banner', hash: 'hash2', tag: 'A', originalKey: 'banner<!A>' }
 * // ]
 *
 * @example
 * // Tags in arrays
 * const uploads = findUploadTags({
 *     attachments: [
 *         { "file<!B>": "hash1" },
 *         { "file<!B>": "hash2" }
 *     ]
 * })
 * // [
 * //   { path: 'attachments.0.file', hash: 'hash1', tag: 'B', originalKey: 'file<!B>' },
 * //   { path: 'attachments.1.file', hash: 'hash2', tag: 'B', originalKey: 'file<!B>' }
 * // ]
 */
function findUploadTags(obj, path = "") {
  const uploads = [];

  // Base case: null, undefined, or primitives have no tags
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return uploads;
  }

  // Handle arrays - recurse into each element with index as path segment
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      uploads.push(
        ...findUploadTags(obj[i], path ? `${path}.${i}` : String(i)),
      );
    }
    return uploads;
  }

  // Handle objects - check each key for tags or recurse
  for (const key of Object.keys(obj)) {
    // Check for <!B> (Buffer) tag
    const bMatch = key.match(/^(.+)<!B>$/);
    // Check for <!A> (ArrayBuffer) tag
    const aMatch = key.match(/^(.+)<!A>$/);

    if (bMatch) {
      uploads.push({
        path: path ? `${path}.${bMatch[1]}` : bMatch[1],
        hash: obj[key],
        tag: "B",
        originalKey: key,
      });
    } else if (aMatch) {
      uploads.push({
        path: path ? `${path}.${aMatch[1]}` : aMatch[1],
        hash: obj[key],
        tag: "A",
        originalKey: key,
      });
    } else {
      // No tag on this key, recurse into the value
      uploads.push(...findUploadTags(obj[key], path ? `${path}.${key}` : key));
    }
  }

  return uploads;
}

/**
 * Recursively finds all file tags (`<!F>`) in an object.
 *
 * File tags are used for streaming client-to-client file transfers.
 * Unlike upload tags, file tags reference files that are streamed
 * between clients without the server storing the entire file.
 *
 * @function findFileTags
 * @param {Object} obj - The object to search for file tags
 * @param {string} [path=''] - Current path prefix (used in recursion)
 * @returns {FileTag[]} Array of detected file tags with their paths and metadata
 *
 * @example
 * const files = findFileTags({
 *     "document<!F>": "file123",
 *     metadata: { name: "report.pdf" }
 * })
 * // [{ path: 'document', hash: 'file123', originalKey: 'document<!F>' }]
 *
 * @example
 * // Nested file tags
 * const files = findFileTags({
 *     attachments: {
 *         "primary<!F>": "f1",
 *         "secondary<!F>": "f2"
 *     }
 * })
 * // [
 * //   { path: 'attachments.primary', hash: 'f1', originalKey: 'primary<!F>' },
 * //   { path: 'attachments.secondary', hash: 'f2', originalKey: 'secondary<!F>' }
 * // ]
 */
function findFileTags(obj, path = "") {
  const files = [];

  // Base case: null, undefined, or primitives have no tags
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return files;
  }

  // Handle arrays - recurse into each element with index as path segment
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      files.push(...findFileTags(obj[i], path ? `${path}.${i}` : String(i)));
    }
    return files;
  }

  // Handle objects - check each key for file tags or recurse
  for (const key of Object.keys(obj)) {
    // Check for <!F> (File) tag
    const fMatch = key.match(/^(.+)<!F>$/);

    if (fMatch) {
      files.push({
        path: path ? `${path}.${fMatch[1]}` : fMatch[1],
        hash: obj[key],
        originalKey: key,
      });
    } else {
      // No tag on this key, recurse into the value
      files.push(...findFileTags(obj[key], path ? `${path}.${key}` : key));
    }
  }

  return files;
}

/**
 * Recursively cleans upload tags from an object.
 *
 * Transforms keys like `"avatar<!B>"` to `"avatar"` throughout the object tree.
 * This prepares the object for controller consumption after binary data
 * has been collected.
 *
 * The function:
 * - Removes `<!B>` and `<!A>` suffixes from keys
 * - Preserves the structure of the object
 * - Recursively processes nested objects and arrays
 * - Returns a new object (does not mutate the original)
 *
 * @function cleanUploadTags
 * @param {Object} obj - The object with tagged keys to clean
 * @returns {Object} New object with tags removed from keys
 *
 * @example
 * // Clean a simple object
 * const cleaned = cleanUploadTags({
 *     "image<!B>": "hash123",
 *     name: "Photo"
 * })
 * // { image: 'hash123', name: 'Photo' }
 *
 * @example
 * // Clean nested objects
 * const cleaned = cleanUploadTags({
 *     user: {
 *         "avatar<!B>": "hash1",
 *         profile: {
 *             "banner<!A>": "hash2",
 *             bio: "Hello"
 *         }
 *     }
 * })
 * // {
 * //   user: {
 * //     avatar: 'hash1',
 * //     profile: {
 * //       banner: 'hash2',
 * //       bio: 'Hello'
 * //     }
 * //   }
 * // }
 *
 * @example
 * // Clean arrays
 * const cleaned = cleanUploadTags({
 *     files: [
 *         { "data<!B>": "h1", name: "file1" },
 *         { "data<!B>": "h2", name: "file2" }
 *     ]
 * })
 * // {
 * //   files: [
 * //     { data: 'h1', name: 'file1' },
 * //     { data: 'h2', name: 'file2' }
 * //   ]
 * // }
 */
function cleanUploadTags(obj) {
  // Base case: null, undefined, or primitives pass through unchanged
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  // Handle arrays - recursively clean each element
  if (Array.isArray(obj)) {
    return obj.map(cleanUploadTags);
  }

  // Handle objects - clean tagged keys and recurse into values
  const cleaned = {};

  for (const key of Object.keys(obj)) {
    // Check for <!B> (Buffer) tag
    const bMatch = key.match(/^(.+)<!B>$/);
    // Check for <!A> (ArrayBuffer) tag
    const aMatch = key.match(/^(.+)<!A>$/);

    if (bMatch) {
      // Remove <!B> tag, keep the value (hash for now, will be replaced with data)
      cleaned[bMatch[1]] = obj[key];
    } else if (aMatch) {
      // Remove <!A> tag, keep the value
      cleaned[aMatch[1]] = obj[key];
    } else {
      // No tag, recursively clean the value
      cleaned[key] = cleanUploadTags(obj[key]);
    }
  }

  return cleaned;
}

/**
 * Sets a value at a dot-notation path in an object.
 *
 * Used to inject binary data into the cleaned message object after
 * the upload has been received. Navigates to the specified path
 * and sets the value.
 *
 * **Note**: This function mutates the original object.
 *
 * @function setValueAtPath
 * @param {Object} obj - The object to modify
 * @param {string} path - Dot-notation path (e.g., 'user.profile.avatar')
 * @param {*} value - The value to set at the path
 *
 * @example
 * // Set a simple path
 * const obj = { avatar: 'hash123' }
 * setValueAtPath(obj, 'avatar', Buffer.from([1, 2, 3]))
 * // obj is now: { avatar: <Buffer 01 02 03> }
 *
 * @example
 * // Set a nested path
 * const obj = { user: { profile: { avatar: 'hash' } } }
 * setValueAtPath(obj, 'user.profile.avatar', Buffer.from('image'))
 * // obj.user.profile.avatar is now a Buffer
 *
 * @example
 * // Set a path in an array
 * const obj = { files: [{ data: 'h1' }, { data: 'h2' }] }
 * setValueAtPath(obj, 'files.0.data', Buffer.from('content1'))
 * // obj.files[0].data is now a Buffer
 *
 * @example
 * // Usage in upload processing flow
 * const message = cleanUploadTags({ "image<!B>": "hash123" })
 * // message: { image: 'hash123' }
 *
 * // After receiving the binary upload...
 * setValueAtPath(message, 'image', uploadedBuffer)
 * // message: { image: <Buffer ...> }
 */
function setValueAtPath(obj, path, value) {
  const parts = path.split(".");
  let current = obj;

  // Navigate to the parent of the target
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]];
  }

  // Set the value at the final key
  current[parts[parts.length - 1]] = value;
}

module.exports = {
  /**
   * Find all upload tags (<!B> and <!A>) in an object.
   * @function
   */
  findUploadTags,

  /**
   * Find all file tags (<!F>) in an object.
   * @function
   */
  findFileTags,

  /**
   * Clean upload tags from object keys.
   * @function
   */
  cleanUploadTags,

  /**
   * Set a value at a dot-notation path.
   * @function
   */
  setValueAtPath,
};
