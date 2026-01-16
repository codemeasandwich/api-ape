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
 * const file = await download({
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

  const result = await client.call(endpoint, payload, timeout);
  return result;
}

module.exports = download;
