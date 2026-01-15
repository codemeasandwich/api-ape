const upload = require('./upload');
const download = require('./download');

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
 * const { uploadResult, downloadResult } = await roundTrip({
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

module.exports = roundTrip;
