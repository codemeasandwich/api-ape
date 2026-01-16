/**
 * @fileoverview Common utilities for file handling in api-ape client
 *
 * This module provides shared utility functions used by both file upload
 * (fileHandling.js) and file download (fileDownload.js) modules.
 *
 * ## Key Functions
 *
 * - **Binary Detection**: `isBinaryData()`, `getBinaryTag()`
 * - **Hash Generation**: `generateUploadHash()`
 * - **Object Traversal**: `setValueAtPath()`, `findTaggedProps()`, `cleanTaggedKeys()`
 *
 * ## Tag System
 *
 * api-ape uses special key suffixes to mark binary data references:
 * - `<!L>` - Server-linked binary (download from server)
 * - `<!F>` - File share (client-to-client transfer)
 * - `<!A>` - ArrayBuffer upload
 * - `<!B>` - Blob upload
 *
 * @module client/connection/fileUtils
 * @see {@link module:client/connection/fileHandling} for upload processing
 * @see {@link module:client/connection/fileDownload} for download processing
 *
 * @example
 * import {
 *   isBinaryData,
 *   findTaggedProps,
 *   setValueAtPath
 * } from './fileUtils'
 *
 * // Check for binary data
 * const data = new ArrayBuffer(100)
 * console.log(isBinaryData(data)) // true
 *
 * // Find tagged properties in response
 * const response = { 'image<!L>': 'abc123', name: 'photo.jpg' }
 * const tags = findTaggedProps(response, 'L')
 * // [{ path: 'image', hash: 'abc123', originalKey: 'image<!L>' }]
 */

/**
 * Check if a value is binary data
 *
 * Detects ArrayBuffer, TypedArray views (Uint8Array, Int32Array, etc.),
 * and Blob objects. Used to determine if a value needs special handling
 * during serialization.
 *
 * @param {any} value - The value to check
 * @returns {boolean} True if the value is binary data, false otherwise
 *
 * @example
 * // ArrayBuffer
 * isBinaryData(new ArrayBuffer(10))  // true
 *
 * // TypedArray views
 * isBinaryData(new Uint8Array(10))   // true
 * isBinaryData(new Float32Array(10)) // true
 *
 * // Blob (browser only)
 * isBinaryData(new Blob(['hello']))  // true
 *
 * // Non-binary
 * isBinaryData('string')             // false
 * isBinaryData({ key: 'value' })     // false
 * isBinaryData(null)                 // false
 * isBinaryData(undefined)            // false
 */
export function isBinaryData(value) {
  if (value === null || value === undefined) return false;
  return (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof Blob !== "undefined" && value instanceof Blob)
  );
}

/**
 * Get the binary type tag for a value
 *
 * Returns a single character tag indicating the binary data type:
 * - `'A'` for ArrayBuffer and TypedArray views
 * - `'B'` for Blob objects
 *
 * This tag is used in the wire protocol to indicate how to
 * reconstruct the binary data on the receiving end.
 *
 * @param {ArrayBuffer|ArrayBufferView|Blob} value - The binary value to tag
 * @returns {'A'|'B'} The type tag character
 *
 * @example
 * getBinaryTag(new ArrayBuffer(10))       // 'A'
 * getBinaryTag(new Uint8Array(10))        // 'A'
 * getBinaryTag(new Blob(['hello']))       // 'B'
 *
 * @example
 * // Used when building upload metadata
 * const tag = getBinaryTag(fileData)
 * const key = `attachment<!${tag}>`  // 'attachment<!A>' or 'attachment<!B>'
 */
export function getBinaryTag(value) {
  if (typeof Blob !== "undefined" && value instanceof Blob) return "B";
  return "A";
}

/**
 * Generate a simple hash for binary upload path identification
 *
 * Creates a short hash string from a path string, used to uniquely
 * identify binary data uploads. Uses a simple string hashing algorithm
 * with base-36 encoding for compact representation.
 *
 * Note: This is not cryptographically secure - it's for identification only.
 *
 * @param {string} path - The property path to hash (e.g., 'user.avatar')
 * @returns {string} Base-36 encoded hash string
 *
 * @example
 * generateUploadHash('image')           // e.g., 'k3m9x'
 * generateUploadHash('user.avatar')     // e.g., 'p7n2w'
 * generateUploadHash('files.0')         // e.g., 'q1r8t'
 *
 * @example
 * // Used in upload processing
 * const hash = generateUploadHash('documents.contract')
 * const uploadUrl = `/api/ape/data/${queryId}/${hash}`
 */
export function generateUploadHash(path) {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Set a value at a nested dot-notation path in an object
 *
 * Traverses an object following a dot-separated path and sets
 * the value at the final key. The path must be valid (all intermediate
 * objects must exist).
 *
 * @param {Object} obj - The object to modify
 * @param {string} path - Dot-notation path (e.g., 'user.profile.avatar')
 * @param {any} value - The value to set at the path
 * @returns {void}
 * @throws {TypeError} If intermediate path segments don't exist
 *
 * @example
 * const data = { user: { profile: { name: 'Alice' } } }
 *
 * setValueAtPath(data, 'user.profile.avatar', new ArrayBuffer(100))
 * // data.user.profile.avatar is now the ArrayBuffer
 *
 * @example
 * // Simple path
 * const obj = { image: 'placeholder' }
 * setValueAtPath(obj, 'image', binaryData)
 *
 * @example
 * // Array index path
 * const obj = { files: [null, null] }
 * setValueAtPath(obj, 'files.0', fileBuffer)
 * setValueAtPath(obj, 'files.1', anotherBuffer)
 */
export function setValueAtPath(obj, path, value) {
  const parts = path.split(".");
  let current = obj;

  // Navigate to parent of target property
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]];
  }

  // Set the value at the final key
  current[parts[parts.length - 1]] = value;
}

/**
 * Find properties with a specific tag suffix in a nested object
 *
 * Recursively searches through an object (including arrays) for keys
 * ending with a tag suffix like `<!L>`, `<!F>`, `<!A>`, or `<!B>`.
 * Returns information about each tagged property found.
 *
 * ## Tag Types
 * - `L` - Linked binary resource (server sends hash, client downloads)
 * - `F` - File share (client-to-client transfer)
 * - `A` - ArrayBuffer upload marker
 * - `B` - Blob upload marker
 *
 * @param {Object|Array|any} obj - The object to search
 * @param {string} tag - The tag to look for (without <! and >)
 * @param {string} [path=''] - Current path (used internally for recursion)
 * @returns {Array<{path: string, hash: string, originalKey: string}>} Array of found tagged properties
 *
 * @example
 * // Find server-linked binary references
 * const response = {
 *   name: 'Report',
 *   'pdf<!L>': 'hash123',
 *   'thumbnail<!L>': 'hash456'
 * }
 *
 * const links = findTaggedProps(response, 'L')
 * // Returns:
 * // [
 * //   { path: 'pdf', hash: 'hash123', originalKey: 'pdf<!L>' },
 * //   { path: 'thumbnail', hash: 'hash456', originalKey: 'thumbnail<!L>' }
 * // ]
 *
 * @example
 * // Find nested tagged properties
 * const data = {
 *   user: {
 *     'avatar<!L>': 'avatarHash',
 *     documents: [
 *       { 'file<!L>': 'doc1Hash' },
 *       { 'file<!L>': 'doc2Hash' }
 *     ]
 *   }
 * }
 *
 * const links = findTaggedProps(data, 'L')
 * // Returns paths: 'user.avatar', 'user.documents.0.file', 'user.documents.1.file'
 *
 * @example
 * // Find file share tags
 * const message = { 'attachment<!F>': 'shareHash123' }
 * const shares = findTaggedProps(message, 'F')
 */
export function findTaggedProps(obj, tag, path = "") {
  const results = [];

  // Base case: null, undefined, or non-object
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return results;
  }

  // Handle arrays - recurse into each element
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      results.push(
        ...findTaggedProps(obj[i], tag, path ? `${path}.${i}` : String(i)),
      );
    }
    return results;
  }

  // Handle objects - check each key for tag suffix
  const suffix = `<!${tag}>`;

  for (const key of Object.keys(obj)) {
    if (key.endsWith(suffix)) {
      // Found a tagged key - extract the clean name and hash
      const cleanKey = key.slice(0, -4); // Remove <!X> suffix (4 chars)
      results.push({
        path: path ? `${path}.${cleanKey}` : cleanKey,
        hash: obj[key],
        originalKey: key,
      });
    } else {
      // Not tagged - recurse into value
      results.push(
        ...findTaggedProps(obj[key], tag, path ? `${path}.${key}` : key),
      );
    }
  }

  return results;
}

/**
 * Clean tagged keys from an object (rename `key<!X>` to `key`)
 *
 * Creates a new object with tag suffixes removed from keys.
 * Recursively processes nested objects and arrays.
 *
 * This is used after finding tagged properties to create a clean
 * object structure where the tags have been replaced with actual values.
 *
 * @param {Object|Array|any} obj - The object to clean
 * @param {string} tag - The tag to remove (without <! and >)
 * @returns {Object|Array|any} New object with cleaned keys
 *
 * @example
 * // Clean L-tagged keys
 * const response = {
 *   name: 'Photo',
 *   'image<!L>': 'hash123',
 *   size: 1024
 * }
 *
 * const cleaned = cleanTaggedKeys(response, 'L')
 * // Returns: { name: 'Photo', image: 'hash123', size: 1024 }
 *
 * @example
 * // Nested cleaning
 * const data = {
 *   user: {
 *     'avatar<!L>': 'avatarHash'
 *   }
 * }
 *
 * const cleaned = cleanTaggedKeys(data, 'L')
 * // Returns: { user: { avatar: 'avatarHash' } }
 *
 * @example
 * // Array handling
 * const files = [
 *   { 'data<!L>': 'hash1' },
 *   { 'data<!L>': 'hash2' }
 * ]
 *
 * const cleaned = cleanTaggedKeys(files, 'L')
 * // Returns: [{ data: 'hash1' }, { data: 'hash2' }]
 */
export function cleanTaggedKeys(obj, tag) {
  // Base case: null, undefined, or non-object - return as-is
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  // Handle arrays - map each element
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanTaggedKeys(item, tag));
  }

  // Handle objects - process each key
  const cleaned = {};
  const suffix = `<!${tag}>`;

  for (const key of Object.keys(obj)) {
    if (key.endsWith(suffix)) {
      // Remove the tag suffix from the key
      cleaned[key.slice(0, -4)] = obj[key];
    } else {
      // Keep key as-is, but recursively clean the value
      cleaned[key] = cleanTaggedKeys(obj[key], tag);
    }
  }

  return cleaned;
}
