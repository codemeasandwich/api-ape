/**
 * @fileoverview ClientInstance RPC helpers — call, binary uploads, hashes (test harness).
 *
 * @module simulator/harness/client-instance-rpc-proto
 */
const jss = require("../../utils/jss");
const messageHash = require("../../utils/messageHash");
const http = require("http");
const https = require("https");

module.exports = {
/**
 * Perform a request/response RPC round-trip through the active transport.
 *
 * Domain: primary harness API for asserting server handlers, timeouts, and resume —
 * same contract as production clients using typed messages with derived `queryId`.
 *
 * Technical: builds `{ type, data }` via `jss.stringify`, derives `queryId` from
 * `messageHash`, registers `_pendingRequests`, sends via `_sendRaw`, resolves or rejects
 * on reply or timeout.
 *
 * @param {string} endpoint - API path or logical type (leading `/` stripped)
 * @param {*} data - Request payload serialized into JSS
 * @param {number} [timeout=1000] - Milliseconds before the pending RPC is rejected
 * @returns {Promise<*>} Server response payload for the RPC
 */
async call(endpoint, data, timeout = 1000) {
  if (!this.connected) {
    throw new Error("Client not connected");
  }

  // Normalize endpoint path
  const type = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;

  // Build the message the same way the server expects
  const message = jss.stringify({ type, data });

  // Generate queryId from message hash - this is how the server does it
  const queryId = messageHash(message);

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      this._pendingRequests.delete(queryId);
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    this._pendingRequests.set(queryId, {
      resolve,
      reject,
      timeout: timeoutId,
    });

    // Send the pre-built message directly
    this._sendRaw(message).catch((err) => {
      this._pendingRequests.delete(queryId);
      clearTimeout(timeoutId);
      reject(err);
    });
  });
},

/**
 * Call an API endpoint with binary data fields
 *
 * This method enables testing of the binary upload tag system.
 * Binary fields are tagged with <!B> in the message, and the actual
 * binary data is sent via HTTP PUT to the data endpoint.
 *
 * @param {string} endpoint - The endpoint path
 * @param {Object} textData - Non-binary data fields
 * @param {Object} binaryFields - Binary fields { fieldName: Buffer }
 * @param {number} [timeout=5000] - Request timeout (longer for uploads)
 * @returns {Promise<any>} The response from the server
 *
 * @example
 * const result = await client.callWithBinary(
 *   'files/upload',
 *   { filename: 'photo.jpg' },
 *   { file: Buffer.from('binary data') }
 * )
 */
async callWithBinary(endpoint, textData, binaryFields, timeout = 5000) {
  if (!this.connected) {
    throw new Error("Client not connected");
  }

  // Normalize endpoint path
  const type = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;

  // Build tagged data with binary field references
  const taggedData = { ...textData };

  // Generate hashes for each binary field and tag them
  const uploadTasks = [];
  for (const [fieldName, binaryData] of Object.entries(binaryFields)) {
    // Create a simple hash from field name
    const hash = this._generateHash(fieldName);
    taggedData[`${fieldName}<!B>`] = hash;
    uploadTasks.push({ fieldName, hash, data: binaryData });
  }

  // Build the message with tagged fields
  const message = jss.stringify({ type, data: taggedData });
  const queryId = messageHash(message);

  // Set up promise for response
  const responsePromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      this._pendingRequests.delete(queryId);
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    this._pendingRequests.set(queryId, {
      resolve,
      reject,
      timeout: timeoutId,
    });
  });

  // Send the WebSocket message first (registers upload expectations)
  await this._sendRaw(message);

  // Yield to event loop multiple times to let server process the message
  // This is needed because client and server are in the same process in tests
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }

  // Now upload each binary field via HTTP PUT
  for (const { hash, data } of uploadTasks) {
    await this._uploadBinary(queryId, hash, data);
  }

  // Wait for the response
  return responsePromise;
},

/**
 * Make an API call with ArrayBuffer binary fields using <!A> tags
 *
 * Similar to callWithBinary but uses <!A> tags instead of <!B> tags.
 * The <!A> tag indicates the client expects an ArrayBuffer to be returned.
 *
 * @param {string} endpoint - The API endpoint to call
 * @param {Object} textData - Non-binary data to include
 * @param {Object<string, Buffer>} arrayBufferFields - Map of field names to binary data
 * @param {number} [timeout=5000] - Timeout in milliseconds
 * @returns {Promise<*>} The API response
 *
 * @example
 * const result = await client.callWithArrayBuffer(
 *   'binary-upload',
 *   { filename: 'data.bin' },
 *   { buffer: Buffer.from('binary data') }
 * )
 */
async callWithArrayBuffer(endpoint, textData, arrayBufferFields, timeout = 5000) {
  if (!this.connected) {
    throw new Error("Client not connected");
  }

  // Normalize endpoint path
  const type = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;

  // Build tagged data with ArrayBuffer field references
  const taggedData = { ...textData };

  // Generate hashes for each binary field and tag them with <!A>
  const uploadTasks = [];
  for (const [fieldName, binaryData] of Object.entries(arrayBufferFields)) {
    const hash = this._generateHash(fieldName);
    taggedData[`${fieldName}<!A>`] = hash; // <!A> instead of <!B>
    uploadTasks.push({ fieldName, hash, data: binaryData });
  }

  // Build the message with tagged fields
  const message = jss.stringify({ type, data: taggedData });
  const queryId = messageHash(message);

  // Set up promise for response
  const responsePromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      this._pendingRequests.delete(queryId);
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    this._pendingRequests.set(queryId, {
      resolve,
      reject,
      timeout: timeoutId,
    });
  });

  // Send the WebSocket message first (registers upload expectations)
  await this._sendRaw(message);

  // Yield to event loop multiple times to let server process the message
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }

  // Upload each binary field via HTTP PUT
  for (const { hash, data } of uploadTasks) {
    await this._uploadBinary(queryId, hash, data);
  }

  return responsePromise;
},

/**
 * Send a raw JSS message and wait for response
 *
 * Allows testing edge cases like <!F> tags in request data.
 * The message object should have 'type' and 'data' properties.
 *
 * @param {Object} messageObject - Message to send
 * @param {string} messageObject.type - API endpoint type
 * @param {*} messageObject.data - Request data (can include special tags)
 * @param {number} [timeout=5000] - Timeout in milliseconds
 * @returns {Promise<*>} The API response
 *
 * @example
 * const result = await client.callRaw({
 *   type: 'echo',
 *   data: { 'document<!F>': 'file-hash' }
 * })
 */
async callRaw(messageObject, timeout = 5000) {
  if (!this.connected) {
    throw new Error("Client not connected");
  }

  // Build the message
  const message = jss.stringify(messageObject);
  const queryId = messageHash(message);

  // Set up promise for response
  const responsePromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      this._pendingRequests.delete(queryId);
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    this._pendingRequests.set(queryId, {
      resolve,
      reject,
      timeout: timeoutId,
    });
  });

  // Send the raw message
  await this._sendRaw(message);

  return responsePromise;
},

/**
 * Generate a simple hash from a string
 * @param {string} input - String to hash
 * @returns {string} Hash string
 * @private
 */
_generateHash(input) {
  let hash = 0;
  const str = `${Date.now()}:${input}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
},

/**
 * Upload binary data via HTTP PUT
 * @param {string} queryId - The query ID for this request
 * @param {string} hash - The hash identifying this upload
 * @param {Buffer} data - The binary data to upload
 * @returns {Promise<void>}
 * @private
 */
async _uploadBinary(queryId, hash, data) {
  // Server expects: /{where}/ape/data/{queryId}/{hash}
  const uploadUrl = `${this.url}/${this.apiPath}/ape/data/${queryId}/${hash}`;
  const parsed = new URL(uploadUrl);
  const httpModule = parsed.protocol === "https:" ? https : http;

  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Length": data.length,
    // Include server-assigned client ID for authentication
    "X-Ape-Client-Id": this.serverClientId || "",
  };
  const cookieHeader = this._getCookieHeader();
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  return new Promise((resolve, reject) => {
    const req = httpModule.request(
      uploadUrl,
      {
        method: "PUT",
        headers,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${res.statusCode} ${body}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

};
