/**
 * Message Controller - Handles messages with broadcasting
 *
 * Used for testing broadcast functionality (broadcastOthers, etc.)
 *
 * @module test-api/message
 */

// In-memory message store for testing
const _messages = [];

/**
 * Handle incoming message and broadcast to other clients
 *
 * @param {Object} data - Message data
 * @param {string} data.text - The message text
 * @param {string} [data.user] - Optional username
 * @returns {Object} Confirmation with message ID
 */
module.exports = function (data) {
  const message = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    text: data.text,
    user: data.user || this.clientId,
    timestamp: new Date().toISOString()
  };

  // Store the message
  _messages.push(message);

  // Keep only last 100 messages
  if (_messages.length > 100) {
    _messages.shift();
  }

  // Broadcast to all other connected clients
  this.broadcastOthers('message', message);

  return {
    success: true,
    messageId: message.id,
    message
  };
};

// Export message store for testing/inspection
module.exports._messages = _messages;

// Export a reset function for test cleanup
module.exports._reset = function () {
  _messages.length = 0;
};
