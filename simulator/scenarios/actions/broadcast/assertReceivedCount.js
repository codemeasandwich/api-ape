const getReceived = require('./getReceived');

/**
 * Assert that a client received exactly N messages of a type
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client to check
 * @param {string} options.type - Message type
 * @param {number} options.count - Expected count
 * @returns {void}
 *
 * @example
 * await assertReceivedCount({ client, type: 'chat', count: 3 })
 */
function assertReceivedCount({ client, type, count }) {
  const messages = getReceived({ client, type });
  if (messages.length !== count) {
    throw new Error(
      `assertReceivedCount: expected ${count} '${type}' messages but got ${messages.length}`
    );
  }
}

module.exports = assertReceivedCount;
