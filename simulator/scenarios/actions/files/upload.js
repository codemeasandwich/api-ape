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
 * const result = await upload({
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

  const result = await client.call(endpoint, payload, timeout);
  return result;
}

module.exports = upload;
