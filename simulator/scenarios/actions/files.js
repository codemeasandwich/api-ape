/**
 * @fileoverview File Actions - Atomic operations for file transfers
 *
 * These actions handle binary file transfers through api-ape's public interface:
 * - Upload: Client sends binary data to server via controller
 * - Download: Server returns binary data to client
 * - Client-to-client: File sharing via broadcasts with <!F> tags
 *
 * All operations execute instantly in the virtual environment (no network delay).
 *
 * @module simulator/scenarios/actions/files
 *
 * @example
 * const { files } = require('../actions')
 *
 * // Upload a file
 * const result = await files.upload({
 *   client,
 *   endpoint: 'files/upload',
 *   filename: 'test.png',
 *   data: Buffer.from([0x89, 0x50, 0x4E, 0x47])
 * })
 *
 * // Download a file
 * const { data, filename } = await files.download({
 *   client,
 *   endpoint: 'files/download',
 *   filename: 'test.png'
 * })
 */

/**
 * Upload binary data to a server endpoint
 *
 * The binary data is automatically handled by api-ape's file transfer system.
 * The controller receives a Buffer in the data property.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Upload endpoint (e.g., 'files/upload')
 * @param {string} [options.filename] - Optional filename
 * @param {Buffer|ArrayBuffer|Uint8Array} options.data - Binary data to upload
 * @param {Object} [options.metadata] - Additional metadata to send
 * @param {number} [options.timeout=5000] - Timeout for upload (ms)
 * @returns {Promise<any>} Response from the upload endpoint
 *
 * @example
 * const result = await files.upload({
 *   client,
 *   endpoint: 'files/upload',
 *   filename: 'document.pdf',
 *   data: pdfBuffer
 * })
 */
async function upload({ client, endpoint, filename, data, metadata = {}, timeout = 5000 }) {
  if (!client) {
    throw new Error('upload: client required');
  }
  if (!endpoint) {
    throw new Error('upload: endpoint required');
  }
  if (!data) {
    throw new Error('upload: data required');
  }

  // Ensure data is a Buffer
  let buffer = data;
  if (data instanceof ArrayBuffer) {
    buffer = Buffer.from(data);
  } else if (ArrayBuffer.isView(data)) {
    buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  const payload = {
    ...metadata,
    data: buffer,
  };

  if (filename) {
    payload.filename = filename;
    payload.name = filename;
  }

  const result = await client.call(endpoint, payload, { timeout });
  return result;
}

/**
 * Upload multiple files in sequence
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Upload endpoint
 * @param {Array<{filename: string, data: Buffer}>} options.files - Files to upload
 * @param {number} [options.timeout=5000] - Timeout per file (ms)
 * @returns {Promise<Array<any>>} Array of upload results
 *
 * @example
 * const results = await files.uploadMany({
 *   client,
 *   endpoint: 'files/upload',
 *   files: [
 *     { filename: 'a.txt', data: Buffer.from('content a') },
 *     { filename: 'b.txt', data: Buffer.from('content b') }
 *   ]
 * })
 */
async function uploadMany({ client, endpoint, files, timeout = 5000 }) {
  if (!Array.isArray(files)) {
    throw new Error('uploadMany: files array required');
  }

  const results = [];
  for (const file of files) {
    const result = await upload({
      client,
      endpoint,
      filename: file.filename,
      data: file.data,
      metadata: file.metadata,
      timeout,
    });
    results.push(result);
  }
  return results;
}

/**
 * Download binary data from a server endpoint
 *
 * The server controller should return an object with a `data` property
 * containing a Buffer. api-ape automatically handles the binary transfer.
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Download endpoint (e.g., 'files/download')
 * @param {string} [options.filename] - Filename to request
 * @param {string} [options.id] - File ID to request
 * @param {Object} [options.params] - Additional parameters
 * @param {number} [options.timeout=5000] - Timeout (ms)
 * @returns {Promise<{data: Buffer, filename?: string, contentType?: string}>}
 *
 * @example
 * const file = await files.download({
 *   client,
 *   endpoint: 'files/download',
 *   filename: 'document.pdf'
 * })
 * console.log(file.data) // Buffer
 */
async function download({ client, endpoint, filename, id, params = {}, timeout = 5000 }) {
  if (!client) {
    throw new Error('download: client required');
  }
  if (!endpoint) {
    throw new Error('download: endpoint required');
  }

  const payload = { ...params };
  if (filename) {
    payload.filename = filename;
    payload.name = filename;
  }
  if (id) {
    payload.id = id;
  }

  const result = await client.call(endpoint, payload, { timeout });
  return result;
}

/**
 * Download and verify file matches expected content
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Download endpoint
 * @param {string} [options.filename] - Filename to request
 * @param {Buffer} options.expectedData - Expected binary content
 * @param {number} [options.timeout=5000] - Timeout (ms)
 * @returns {Promise<Object>} Downloaded file data
 *
 * @example
 * await files.downloadAndVerify({
 *   client,
 *   endpoint: 'files/download',
 *   filename: 'test.txt',
 *   expectedData: Buffer.from('expected content')
 * })
 */
async function downloadAndVerify({ client, endpoint, filename, expectedData, timeout = 5000 }) {
  const result = await download({ client, endpoint, filename, timeout });

  const actualData = result.data;
  if (!actualData) {
    throw new Error('downloadAndVerify: response missing data property');
  }

  // Convert to Buffer for comparison
  let actualBuffer = actualData;
  if (actualData instanceof ArrayBuffer) {
    actualBuffer = Buffer.from(actualData);
  }

  let expectedBuffer = expectedData;
  if (expectedData instanceof ArrayBuffer) {
    expectedBuffer = Buffer.from(expectedData);
  }

  if (!Buffer.isBuffer(actualBuffer)) {
    throw new Error(`downloadAndVerify: expected Buffer but got ${typeof actualData}`);
  }

  if (!actualBuffer.equals(expectedBuffer)) {
    throw new Error(
      `downloadAndVerify: data mismatch (got ${actualBuffer.length} bytes, expected ${expectedBuffer.length} bytes)`
    );
  }

  return result;
}

/**
 * Upload and then download to verify round-trip
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.uploadEndpoint - Upload endpoint
 * @param {string} options.downloadEndpoint - Download endpoint
 * @param {string} options.filename - Filename to use
 * @param {Buffer} options.data - Data to upload
 * @param {number} [options.timeout=5000] - Timeout per operation (ms)
 * @returns {Promise<{uploadResult: any, downloadResult: any}>}
 *
 * @example
 * const { uploadResult, downloadResult } = await files.roundTrip({
 *   client,
 *   uploadEndpoint: 'files/upload',
 *   downloadEndpoint: 'files/download',
 *   filename: 'test.bin',
 *   data: Buffer.from([1, 2, 3, 4])
 * })
 */
async function roundTrip({ client, uploadEndpoint, downloadEndpoint, filename, data, timeout = 5000 }) {
  // Upload
  const uploadResult = await upload({
    client,
    endpoint: uploadEndpoint,
    filename,
    data,
    timeout,
  });

  // Download
  const downloadResult = await download({
    client,
    endpoint: downloadEndpoint,
    filename,
    timeout,
  });

  // Verify content matches
  const downloadedData = downloadResult.data;
  let downloadedBuffer = downloadedData;
  if (downloadedData instanceof ArrayBuffer) {
    downloadedBuffer = Buffer.from(downloadedData);
  }

  let originalBuffer = data;
  if (data instanceof ArrayBuffer) {
    originalBuffer = Buffer.from(data);
  }

  if (Buffer.isBuffer(downloadedBuffer) && Buffer.isBuffer(originalBuffer)) {
    if (!downloadedBuffer.equals(originalBuffer)) {
      throw new Error(
        `roundTrip: downloaded data doesn't match uploaded data`
      );
    }
  }

  return { uploadResult, downloadResult };
}

/**
 * Share a file between clients via broadcast (<!F> tag)
 *
 * One client uploads a file and broadcasts a reference to other clients.
 * Other clients can then download the shared file.
 *
 * @param {Object} options - Options
 * @param {Object} options.sender - Client sending the file
 * @param {Object[]} options.receivers - Clients to receive the file
 * @param {string} options.endpoint - Endpoint that handles file sharing
 * @param {Buffer} options.data - File data to share
 * @param {string} [options.filename] - Filename
 * @param {string} [options.broadcastType='file-shared'] - Broadcast type for notification
 * @param {number} [options.timeout=5000] - Timeout (ms)
 * @returns {Promise<{shareResult: any, notifications: Array}>}
 *
 * @example
 * const { shareResult, notifications } = await files.share({
 *   sender: alice,
 *   receivers: [bob, charlie],
 *   endpoint: 'files/share',
 *   data: imageBuffer,
 *   filename: 'photo.jpg'
 * })
 */
async function share({ sender, receivers, endpoint, data, filename, broadcastType = 'file-shared', timeout = 5000 }) {
  if (!sender) {
    throw new Error('share: sender client required');
  }
  if (!Array.isArray(receivers) || receivers.length === 0) {
    throw new Error('share: receivers array required');
  }
  if (!endpoint) {
    throw new Error('share: endpoint required');
  }
  if (!data) {
    throw new Error('share: data required');
  }

  // Set up listeners for receivers
  const notificationPromises = receivers.map((receiver) =>
    receiver.waitFor(broadcastType, timeout).catch(() => null)
  );

  // Sender shares the file
  const payload = { data };
  if (filename) {
    payload.filename = filename;
  }

  const shareResult = await sender.call(endpoint, payload, { timeout });

  // Wait for notifications
  const notifications = await Promise.all(notificationPromises);

  return { shareResult, notifications: notifications.filter(Boolean) };
}

/**
 * Verify a receiver can download a shared file
 *
 * @param {Object} options - Options
 * @param {Object} options.receiver - Client that should download
 * @param {string} options.endpoint - Download endpoint
 * @param {string} options.fileHash - Hash/ID of shared file
 * @param {Buffer} [options.expectedData] - Expected content (if known)
 * @param {number} [options.timeout=5000] - Timeout (ms)
 * @returns {Promise<Object>} Downloaded file data
 */
async function downloadShared({ receiver, endpoint, fileHash, expectedData, timeout = 5000 }) {
  if (!receiver) {
    throw new Error('downloadShared: receiver client required');
  }

  const result = await receiver.call(endpoint, { hash: fileHash }, { timeout });

  if (expectedData) {
    const downloadedBuffer = Buffer.isBuffer(result.data)
      ? result.data
      : Buffer.from(result.data);
    const expectedBuffer = Buffer.isBuffer(expectedData)
      ? expectedData
      : Buffer.from(expectedData);

    if (!downloadedBuffer.equals(expectedBuffer)) {
      throw new Error('downloadShared: downloaded data does not match expected');
    }
  }

  return result;
}

/**
 * Create test file data with specific characteristics
 *
 * @param {Object} options - Options
 * @param {number} options.sizeBytes - Size of file in bytes
 * @param {string} [options.pattern='random'] - Fill pattern: 'random', 'zeros', 'sequential'
 * @returns {Buffer} Generated test data
 *
 * @example
 * const largeFile = files.createTestData({ sizeBytes: 1024 * 1024 }) // 1MB
 * const smallFile = files.createTestData({ sizeBytes: 100, pattern: 'sequential' })
 */
function createTestData({ sizeBytes, pattern = 'random' }) {
  if (!sizeBytes || sizeBytes < 1) {
    throw new Error('createTestData: sizeBytes must be >= 1');
  }

  const buffer = Buffer.alloc(sizeBytes);

  switch (pattern) {
    case 'zeros':
      // Buffer is already zeros
      break;

    case 'sequential':
      for (let i = 0; i < sizeBytes; i++) {
        buffer[i] = i % 256;
      }
      break;

    case 'random':
    default:
      for (let i = 0; i < sizeBytes; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }
      break;
  }

  return buffer;
}

/**
 * Create a test file with specific MIME type signature
 *
 * @param {Object} options - Options
 * @param {string} options.type - File type: 'png', 'jpeg', 'gif', 'pdf', 'text'
 * @param {number} [options.sizeBytes=100] - Total size
 * @returns {{data: Buffer, filename: string, contentType: string}}
 *
 * @example
 * const png = files.createTypedTestFile({ type: 'png', sizeBytes: 500 })
 */
function createTypedTestFile({ type, sizeBytes = 100 }) {
  const signatures = {
    png: {
      magic: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
      ext: 'png',
      contentType: 'image/png',
    },
    jpeg: {
      magic: [0xFF, 0xD8, 0xFF, 0xE0],
      ext: 'jpg',
      contentType: 'image/jpeg',
    },
    gif: {
      magic: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
      ext: 'gif',
      contentType: 'image/gif',
    },
    pdf: {
      magic: [0x25, 0x50, 0x44, 0x46, 0x2D],
      ext: 'pdf',
      contentType: 'application/pdf',
    },
    text: {
      magic: [],
      ext: 'txt',
      contentType: 'text/plain',
    },
  };

  const sig = signatures[type];
  if (!sig) {
    throw new Error(`createTypedTestFile: unknown type '${type}'`);
  }

  const buffer = Buffer.alloc(Math.max(sizeBytes, sig.magic.length));

  // Write magic bytes
  for (let i = 0; i < sig.magic.length; i++) {
    buffer[i] = sig.magic[i];
  }

  // Fill rest with random data
  for (let i = sig.magic.length; i < sizeBytes; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }

  return {
    data: buffer,
    filename: `test.${sig.ext}`,
    contentType: sig.contentType,
  };
}

/**
 * Assert file data matches expected
 *
 * @param {Object} options - Options
 * @param {Buffer|ArrayBuffer} options.actual - Actual data
 * @param {Buffer|ArrayBuffer} options.expected - Expected data
 * @returns {void}
 */
function assertDataEquals({ actual, expected }) {
  let actualBuffer = actual;
  let expectedBuffer = expected;

  if (actual instanceof ArrayBuffer) {
    actualBuffer = Buffer.from(actual);
  }
  if (expected instanceof ArrayBuffer) {
    expectedBuffer = Buffer.from(expected);
  }

  if (!Buffer.isBuffer(actualBuffer)) {
    throw new Error(`assertDataEquals: actual is not a Buffer (got ${typeof actual})`);
  }
  if (!Buffer.isBuffer(expectedBuffer)) {
    throw new Error(`assertDataEquals: expected is not a Buffer (got ${typeof expected})`);
  }

  if (actualBuffer.length !== expectedBuffer.length) {
    throw new Error(
      `assertDataEquals: length mismatch (actual: ${actualBuffer.length}, expected: ${expectedBuffer.length})`
    );
  }

  if (!actualBuffer.equals(expectedBuffer)) {
    throw new Error('assertDataEquals: buffer contents do not match');
  }
}

/**
 * Assert file size is within expected range
 *
 * @param {Object} options - Options
 * @param {Buffer|ArrayBuffer} options.data - File data
 * @param {number} [options.minBytes] - Minimum size
 * @param {number} [options.maxBytes] - Maximum size
 * @param {number} [options.exactBytes] - Exact size
 * @returns {void}
 */
function assertSize({ data, minBytes, maxBytes, exactBytes }) {
  let size;
  if (Buffer.isBuffer(data)) {
    size = data.length;
  } else if (data instanceof ArrayBuffer) {
    size = data.byteLength;
  } else if (ArrayBuffer.isView(data)) {
    size = data.byteLength;
  } else {
    throw new Error(`assertSize: data is not a buffer type (got ${typeof data})`);
  }

  if (exactBytes !== undefined && size !== exactBytes) {
    throw new Error(`assertSize: expected exactly ${exactBytes} bytes but got ${size}`);
  }

  if (minBytes !== undefined && size < minBytes) {
    throw new Error(`assertSize: expected at least ${minBytes} bytes but got ${size}`);
  }

  if (maxBytes !== undefined && size > maxBytes) {
    throw new Error(`assertSize: expected at most ${maxBytes} bytes but got ${size}`);
  }
}

module.exports = {
  // Upload operations
  upload,
  uploadMany,

  // Download operations
  download,
  downloadAndVerify,

  // Round-trip testing
  roundTrip,

  // Client-to-client sharing
  share,
  downloadShared,

  // Test data generation
  createTestData,
  createTypedTestFile,

  // Assertions
  assertDataEquals,
  assertSize,
};
