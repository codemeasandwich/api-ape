/**
 * @fileoverview Binary File Upload Utilities for api-ape Client
 *
 * This module provides utilities for processing and uploading binary data
 * (ArrayBuffer, TypedArray, Blob) in api-ape messages. Binary data is extracted
 * from payloads and uploaded via HTTP, with the original payload modified to
 * contain reference hashes.
 *
 * ## Binary Data Flow (Upload)
 *
 * ```
 * Original Payload                    Processed Payload
 * ─────────────────                   ──────────────────
 * {                                   {
 *   name: 'doc.pdf',                    name: 'doc.pdf',
 *   file: ArrayBuffer(...)    →         'file<!A>': 'abc123'
 * }                                   }
 *                                            │
 *                                            ▼
 *                                     HTTP PUT /api/ape/data/{queryId}/abc123
 *                                            │
 *                                            ▼
 *                                     Server receives binary + reference
 * ```
 *
 * ## Tag System
 *
 * Binary references use a tag system in property keys:
 * - `<!A>` - ArrayBuffer or TypedArray upload
 * - `<!B>` - Blob upload
 * - `<!F>` - File sharing (client-to-client)
 *
 * ## Two Upload Modes
 *
 * 1. **Standard Upload** (`processBinaryForUpload`) - For sending binary data
 *    from client to server as part of a request
 *
 * 2. **File Sharing** (`processBinaryForSharing`) - For client-to-client
 *    binary transfers where data is stored temporarily on server
 *
 * @module client/connection/fileHandling
 * @see {@link module:client/connection/fileDownload} for downloading binary data
 * @see {@link module:client/connection/fileUtils} for shared utilities
 *
 * @example
 * // Upload binary data with a message
 * import { processBinaryForUpload, uploadBinaryData } from './fileHandling'
 *
 * const payload = {
 *   name: 'photo.jpg',
 *   image: myArrayBuffer
 * }
 *
 * const { processedData, uploads } = processBinaryForUpload(payload)
 * // processedData = { name: 'photo.jpg', 'image<!A>': 'hashXYZ' }
 *
 * // Upload binary data separately
 * await uploadBinaryData(queryId, uploads)
 *
 * @example
 * // Share files between clients
 * import { processBinaryForSharing, uploadSharedFiles } from './fileHandling'
 *
 * const { processedData, shares } = processBinaryForSharing({
 *   screenshot: screenshotBlob
 * })
 *
 * await uploadSharedFiles(shares)
 * // Other clients can now fetch the shared file
 */

import { getBaseUrl } from "./network";
import { isBinaryData, getBinaryTag, generateUploadHash } from "./fileUtils";

/**
 * Process a data payload and extract binary data for HTTP upload
 *
 * Recursively traverses the data object, finding any binary data
 * (ArrayBuffer, TypedArray, Blob) and replacing it with a tagged
 * reference hash. The binary data is collected for separate HTTP upload.
 *
 * ## Processing Logic
 *
 * - Primitive values: Passed through unchanged
 * - Binary data: Replaced with `{ __ape_upload__: hash }` and added to uploads
 * - Arrays: Each element processed recursively
 * - Objects: Each property processed recursively, binary keys get tagged
 *
 * @param {any} data - The payload data to process
 * @param {string} [path=''] - Current path in the object tree (for hash generation)
 * @returns {{processedData: any, uploads: Array<{path: string, hash: string, data: any, tag: string}>}}
 *          Object containing the processed data and array of binary uploads
 *
 * @example
 * // Simple binary property
 * const { processedData, uploads } = processBinaryForUpload({
 *   name: 'file.bin',
 *   content: new ArrayBuffer(1024)
 * })
 *
 * console.log(processedData)
 * // { name: 'file.bin', 'content<!A>': '7xyz3' }
 *
 * console.log(uploads)
 * // [{ path: 'content', hash: '7xyz3', data: ArrayBuffer, tag: 'A' }]
 *
 * @example
 * // Nested binary data
 * const { processedData, uploads } = processBinaryForUpload({
 *   files: [
 *     { name: 'a.png', data: buffer1 },
 *     { name: 'b.png', data: buffer2 }
 *   ]
 * })
 *
 * console.log(processedData)
 * // {
 * //   files: [
 * //     { name: 'a.png', 'data<!A>': 'hash1' },
 * //     { name: 'b.png', 'data<!A>': 'hash2' }
 * //   ]
 * // }
 *
 * @example
 * // No binary data - passthrough
 * const { processedData, uploads } = processBinaryForUpload({
 *   message: 'Hello',
 *   count: 42
 * })
 *
 * console.log(processedData)
 * // { message: 'Hello', count: 42 }
 *
 * console.log(uploads)
 * // []
 */
export function processBinaryForUpload(data, path = "") {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return { processedData: data, uploads: [] };
  }

  // Handle binary data - extract and replace with hash reference
  if (isBinaryData(data)) {
    const tag = getBinaryTag(data);
    const hash = generateUploadHash(path || "root");
    return {
      processedData: { [`__ape_upload__`]: hash },
      uploads: [{ path, hash, data, tag }],
    };
  }

  // Handle arrays - process each element recursively
  if (Array.isArray(data)) {
    const processedArray = [];
    const allUploads = [];

    for (let i = 0; i < data.length; i++) {
      const itemPath = path ? `${path}.${i}` : String(i);
      const { processedData, uploads } = processBinaryForUpload(
        data[i],
        itemPath,
      );
      processedArray.push(processedData);
      allUploads.push(...uploads);
    }

    return { processedData: processedArray, uploads: allUploads };
  }

  // Handle objects - process each property recursively
  if (typeof data === "object") {
    const processedObj = {};
    const allUploads = [];

    for (const key of Object.keys(data)) {
      const itemPath = path ? `${path}.${key}` : key;
      const { processedData, uploads } = processBinaryForUpload(
        data[key],
        itemPath,
      );

      // If this property contained binary data, add tag to the key
      if (uploads.length > 0 && processedData?.__ape_upload__) {
        const tag = uploads[uploads.length - 1].tag;
        processedObj[`${key}<!${tag}>`] = processedData.__ape_upload__;
      } else {
        processedObj[key] = processedData;
      }

      allUploads.push(...uploads);
    }

    return { processedData: processedObj, uploads: allUploads };
  }

  // Primitive values - return as-is
  return { processedData: data, uploads: [] };
}

/**
 * Process a data payload and extract binary data for client-to-client sharing
 *
 * Similar to `processBinaryForUpload`, but uses the `<!F>` tag for file sharing.
 * Shared files are uploaded to a temporary storage endpoint and can be fetched
 * by other clients using the hash reference.
 *
 * ## Difference from Standard Upload
 *
 * - Standard uploads are tied to a specific request/query
 * - Shared files are stored with a content-addressable hash
 * - Shared files can be fetched by any client that knows the hash
 *
 * @param {any} data - The payload data to process
 * @param {string} [path=''] - Current path in the object tree (for hash generation)
 * @returns {{processedData: any, shares: Array<{path: string, hash: string, data: any}>}}
 *          Object containing the processed data and array of files to share
 *
 * @example
 * // Share a screenshot with other clients
 * const { processedData, shares } = processBinaryForSharing({
 *   type: 'screenshot',
 *   image: screenshotArrayBuffer,
 *   timestamp: Date.now()
 * })
 *
 * console.log(processedData)
 * // { type: 'screenshot', 'image<!F>': 'shareHash123', timestamp: 1699999999999 }
 *
 * // Upload the shared file
 * await uploadSharedFiles(shares)
 *
 * // Now broadcast to other clients who can fetch the image
 * broadcast('screenshot', processedData)
 *
 * @example
 * // Multiple shared files
 * const { processedData, shares } = processBinaryForSharing({
 *   attachments: [
 *     { name: 'doc1.pdf', content: pdfBuffer1 },
 *     { name: 'doc2.pdf', content: pdfBuffer2 }
 *   ]
 * })
 *
 * await uploadSharedFiles(shares)
 */
export function processBinaryForSharing(data, path = "") {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return { processedData: data, shares: [] };
  }

  // Handle binary data - extract and replace with share hash
  if (isBinaryData(data)) {
    const hash = generateUploadHash(path || "share");
    return {
      processedData: { [`__ape_share__`]: hash },
      shares: [{ path, hash, data }],
    };
  }

  // Handle arrays - process each element recursively
  if (Array.isArray(data)) {
    const processedArray = [];
    const allShares = [];

    for (let i = 0; i < data.length; i++) {
      const itemPath = path ? `${path}.${i}` : String(i);
      const { processedData, shares } = processBinaryForSharing(
        data[i],
        itemPath,
      );
      processedArray.push(processedData);
      allShares.push(...shares);
    }

    return { processedData: processedArray, shares: allShares };
  }

  // Handle objects - process each property recursively
  if (typeof data === "object") {
    const processedObj = {};
    const allShares = [];

    for (const key of Object.keys(data)) {
      const itemPath = path ? `${path}.${key}` : key;
      const { processedData, shares } = processBinaryForSharing(
        data[key],
        itemPath,
      );

      // If this property contained binary data, add F tag to the key
      if (shares.length > 0 && processedData?.__ape_share__) {
        processedObj[`${key}<!F>`] = processedData.__ape_share__;
      } else {
        processedObj[key] = processedData;
      }

      allShares.push(...shares);
    }

    return { processedData: processedObj, shares: allShares };
  }

  // Primitive values - return as-is
  return { processedData: data, shares: [] };
}

/**
 * Upload binary data via HTTP PUT requests
 *
 * Takes the uploads array from `processBinaryForUpload` and sends each
 * binary payload to the server via HTTP PUT. The uploads are performed
 * in parallel for efficiency.
 *
 * ## Upload Endpoint
 *
 * Binary data is uploaded to: `PUT /api/ape/data/{queryId}/{hash}`
 *
 * The server matches the upload to the original WebSocket message using
 * the queryId, and associates the binary data with the correct property
 * using the hash.
 *
 * @param {string} queryId - The query ID of the associated WebSocket message
 * @param {Array<{hash: string, data: ArrayBuffer|Blob|TypedArray}>} uploads - Array of upload objects
 * @returns {Promise<void>} Resolves when all uploads complete
 * @throws {Error} If any upload fails
 *
 * @example
 * // Standard usage with processBinaryForUpload
 * const { processedData, uploads } = processBinaryForUpload(payload)
 *
 * if (uploads.length > 0) {
 *   await uploadBinaryData(queryId, uploads)
 * }
 *
 * // Send the processed message via WebSocket
 * ws.send(JSON.stringify({ queryId, data: processedData }))
 *
 * @example
 * // Error handling
 * try {
 *   await uploadBinaryData(queryId, uploads)
 * } catch (err) {
 *   console.error('Binary upload failed:', err)
 *   // Handle failure - maybe retry or notify user
 * }
 */
export async function uploadBinaryData(queryId, uploads) {
  if (uploads.length === 0) return;

  const baseUrl = getBaseUrl();

  await Promise.all(
    uploads.map(async ({ hash, data }) => {
      const response = await fetch(
        `${baseUrl}/api/ape/data/${queryId}/${hash}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/octet-stream" },
          body: data,
        },
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
    }),
  );
}

/**
 * Upload shared files via HTTP PUT for client-to-client transfer
 *
 * Takes the shares array from `processBinaryForSharing` and uploads each
 * file to the server's shared file storage. Other clients can then fetch
 * these files using the hash reference.
 *
 * ## Share Endpoint
 *
 * Shared files are uploaded to: `PUT /api/ape/data/_share/{hash}`
 *
 * The `_share` path indicates this is for client-to-client sharing rather
 * than a request-specific upload.
 *
 * ## Temporary Storage
 *
 * Shared files are stored temporarily on the server and will be cleaned up
 * after a configurable timeout (default: 60 seconds for start, 60 seconds
 * after first access).
 *
 * @param {Array<{hash: string, data: ArrayBuffer|Blob|TypedArray}>} shares - Array of share objects
 * @returns {Promise<void>} Resolves when all uploads complete
 * @throws {Error} If any upload fails
 *
 * @example
 * // Share files with other clients
 * const { processedData, shares } = processBinaryForSharing({
 *   image: imageBuffer
 * })
 *
 * await uploadSharedFiles(shares)
 *
 * // Broadcast to other clients
 * broadcast('shared-image', processedData)
 * // Other clients will receive: { 'image<!F>': 'hashXYZ' }
 * // They can fetch it via: GET /api/ape/data/hashXYZ
 *
 * @example
 * // Batch upload multiple files
 * const shares = [
 *   { hash: 'hash1', data: buffer1 },
 *   { hash: 'hash2', data: buffer2 },
 *   { hash: 'hash3', data: buffer3 }
 * ]
 *
 * // All uploads happen in parallel
 * await uploadSharedFiles(shares)
 */
export async function uploadSharedFiles(shares) {
  if (shares.length === 0) return;

  const baseUrl = getBaseUrl();

  await Promise.all(
    shares.map(async ({ hash, data }) => {
      const response = await fetch(`${baseUrl}/api/ape/data/_share/${hash}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/octet-stream" },
        body: data,
      });

      if (!response.ok) {
        throw new Error(`Shared upload failed: ${response.status}`);
      }
    }),
  );
}

/**
 * Re-export setValueAtPath for fileDownload module
 *
 * This utility is used by the download module to place fetched binary
 * data back into the correct location in the data object.
 *
 * @see {@link module:client/connection/fileUtils.setValueAtPath}
 */
export { setValueAtPath } from "./fileUtils";
