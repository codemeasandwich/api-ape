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
 * const { shareResult, notifications } = await share({
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

module.exports = share;
