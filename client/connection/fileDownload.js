/**
 * @fileoverview Binary file download/fetch utilities for api-ape client
 *
 * This module handles fetching binary data that is referenced in server responses.
 * When the server sends binary data (like images, files, etc.), it doesn't include
 * the raw bytes in the WebSocket message. Instead, it sends a tagged reference
 * that this module resolves by fetching the actual data via HTTP.
 *
 * ## Tag Types
 *
 * - `<!L>` - **Linked Resource**: Binary data from server responses (server → client)
 * - `<!F>` - **Shared File**: Binary data from other clients (client → client via server)
 *
 * ## Data Flow
 *
 * ```
 * Server Response:
 *   { "image<!L>": "abc123", "name": "photo.jpg" }
 *
 * After fetchLinkedResources():
 *   { "image": ArrayBuffer(...), "name": "photo.jpg" }
 * ```
 *
 * ## Retry Logic
 *
 * Shared files (F-tagged) use exponential backoff retry because the file
 * might not be immediately available when the message arrives (the sender
 * might still be uploading).
 *
 * @module client/connection/fileDownload
 * @see {@link module:client/connection/fileHandling} for upload utilities
 * @see {@link module:client/connection/fileUtils} for shared utility functions
 *
 * @example
 * // Hydrating a server response
 * import { fetchLinkedResources, fetchSharedFiles } from './fileDownload'
 *
 * const serverData = { "avatar<!L>": "hash123", username: "alice" }
 *
 * // Fetch the binary data
 * const hydrated = await fetchLinkedResources(serverData)
 * // Result: { avatar: ArrayBuffer(...), username: "alice" }
 *
 * @example
 * // Handling shared files from other clients
 * const messageData = { "attachment<!F>": "filehash", text: "Check this out!" }
 *
 * // Fetch with retry logic
 * const hydrated = await fetchSharedFiles(messageData)
 * // Result: { attachment: ArrayBuffer(...), text: "Check this out!" }
 */

import { apeLog } from "../../utils/apeLogger.js";
import { getBaseUrl } from "./network";
import { setValueAtPath, findTaggedProps, cleanTaggedKeys } from "./fileUtils";

/**
 * Fetch binary resources linked from server responses
 *
 * This function processes data objects that contain L-tagged binary references.
 * Each L-tagged property is replaced with the actual binary data fetched from
 * the server's data endpoint.
 *
 * ## Processing Steps
 *
 * 1. Scan the data object for properties ending with `<!L>`
 * 2. For each tagged property, extract the hash value
 * 3. Fetch the binary data from `/api/ape/data/{hash}`
 * 4. Replace the hash with the fetched ArrayBuffer
 * 5. Rename the key to remove the `<!L>` suffix
 *
 * ## Error Handling
 *
 * If a fetch fails, the property is set to `null` rather than throwing.
 * This prevents one failed resource from breaking the entire response.
 *
 * @param {Object} data - Data object potentially containing L-tagged binary references
 * @param {string} [clientId] - Optional client ID for authentication header
 * @returns {Promise<Object>} Hydrated data object with binary resources fetched
 *
 * @example
 * // Server sends avatar as a linked resource
 * const serverResponse = {
 *   "profilePic<!L>": "abc123def456",
 *   "username": "alice",
 *   "bio": "Hello world!"
 * }
 *
 * const hydrated = await fetchLinkedResources(serverResponse)
 * // Result:
 * // {
 * //   profilePic: ArrayBuffer(12345),  // The actual image data
 * //   username: "alice",
 * //   bio: "Hello world!"
 * // }
 *
 * @example
 * // Multiple binary resources
 * const response = {
 *   "thumbnail<!L>": "hash1",
 *   "fullImage<!L>": "hash2",
 *   "metadata": { width: 1920, height: 1080 }
 * }
 *
 * const hydrated = await fetchLinkedResources(response)
 * // Both thumbnail and fullImage are fetched in parallel
 *
 * @example
 * // Nested binary resources
 * const response = {
 *   user: {
 *     name: "Bob",
 *     "avatar<!L>": "avatarhash"
 *   },
 *   attachments: [
 *     { "file<!L>": "file1hash", name: "doc.pdf" },
 *     { "file<!L>": "file2hash", name: "image.png" }
 *   ]
 * }
 *
 * const hydrated = await fetchLinkedResources(response)
 * // All nested binary resources are fetched
 */
export async function fetchLinkedResources(data, clientId) {
  const resources = findTaggedProps(data, "L");
  if (resources.length === 0) return data;

  apeLog.log(`Fetching ${resources.length} binary resource(s)`);
  const cleanedData = cleanTaggedKeys(data, "L");
  const baseUrl = getBaseUrl();

  await Promise.all(
    resources.map(async ({ path, hash }) => {
      try {
        const response = await fetch(`${baseUrl}/api/ape/data/${hash}`, {
          credentials: "include",
          headers: { "X-Ape-Client-Id": clientId || "" },
        });
        if (!response.ok) throw new Error(`Failed: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        setValueAtPath(cleanedData, path, arrayBuffer);
      } catch (err) {
        apeLog.error(`Failed to fetch binary resource at ${path}:`, err);
        setValueAtPath(cleanedData, path, null);
      }
    }),
  );

  return cleanedData;
}

/**
 * Fetch shared files from client-to-client transfers
 *
 * This function handles F-tagged file references, which represent files
 * shared between clients via the server. Unlike L-tagged resources, F-tagged
 * files use retry logic because the file might not be immediately available
 * (the sending client might still be uploading).
 *
 * ## Retry Behavior
 *
 * - Uses exponential backoff starting at 100ms
 * - Doubles delay after each retry (100ms → 200ms → 400ms → ...)
 * - Retries up to `maxRetries` times (default: 5)
 * - Only retries on 404 errors (file not yet uploaded)
 *
 * ## Use Case
 *
 * Client-to-client file sharing workflow:
 * 1. Client A sends message with file reference
 * 2. Server broadcasts message to Client B
 * 3. Client A uploads file to server (may take time)
 * 4. Client B receives message, attempts to fetch file
 * 5. If 404, retry until file is available
 *
 * @param {Object} data - Data object potentially containing F-tagged file references
 * @param {number} [maxRetries=5] - Maximum number of retry attempts per file
 * @returns {Promise<Object>} Hydrated data object with shared files fetched
 *
 * @example
 * // Receiving a shared file from another client
 * const message = {
 *   "sharedDoc<!F>": "uniquefilehash",
 *   "sender": "alice",
 *   "text": "Here's the document you requested"
 * }
 *
 * const hydrated = await fetchSharedFiles(message)
 * // Result:
 * // {
 * //   sharedDoc: ArrayBuffer(...),  // The shared file
 * //   sender: "alice",
 * //   text: "Here's the document you requested"
 * // }
 *
 * @example
 * // With custom retry count
 * const hydrated = await fetchSharedFiles(data, 10) // Up to 10 retries
 *
 * @example
 * // Multiple shared files
 * const data = {
 *   "photo<!F>": "hash1",
 *   "video<!F>": "hash2",
 *   caption: "My vacation pics!"
 * }
 *
 * // Both files fetched in parallel with independent retry logic
 * const hydrated = await fetchSharedFiles(data)
 */
export async function fetchSharedFiles(data, maxRetries = 5) {
  const files = findTaggedProps(data, "F");
  if (files.length === 0) return data;

  apeLog.log(`Fetching ${files.length} shared file(s)`);
  const cleanedData = cleanTaggedKeys(data, "F");
  const baseUrl = getBaseUrl();

  await Promise.all(
    files.map(async ({ path, hash }) => {
      let retries = 0;
      let backoff = 100;

      while (retries < maxRetries) {
        try {
          const response = await fetch(`${baseUrl}/api/ape/data/${hash}`, {
            credentials: "include",
          });

          if (!response.ok) {
            // Retry on 404 (file not yet uploaded)
            if (response.status === 404 && retries < maxRetries - 1) {
              retries++;
              await new Promise((r) => setTimeout(r, backoff));
              backoff *= 2;
              continue;
            }
            throw new Error(`Failed to fetch shared file: ${response.status}`);
          }

          setValueAtPath(cleanedData, path, await response.arrayBuffer());
          break;
        } catch (err) {
          if (retries >= maxRetries - 1) {
            apeLog.error(`Failed to fetch shared file at ${path}:`, err);
            setValueAtPath(cleanedData, path, null);
          }
          retries++;
          await new Promise((r) => setTimeout(r, backoff));
          backoff *= 2;
        }
      }
    }),
  );

  return cleanedData;
}
