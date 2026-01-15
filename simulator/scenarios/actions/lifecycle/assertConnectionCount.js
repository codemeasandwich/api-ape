/**
 * Assert that onConnect was called N times
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object
 * @param {number} options.count - Expected connection count
 * @returns {void}
 */
function assertConnectionCount({ events, count }) {
  if (events.connections.length !== count) {
    throw new Error(
      `assertConnectionCount: expected ${count} connections but got ${events.connections.length}`
    );
  }
}

module.exports = assertConnectionCount;
