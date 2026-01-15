/**
 * Assert that onDisconnect was called N times
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object
 * @param {number} options.count - Expected disconnection count
 * @returns {void}
 */
function assertDisconnectionCount({ events, count }) {
  if (events.disconnections.length !== count) {
    throw new Error(
      `assertDisconnectionCount: expected ${count} disconnections but got ${events.disconnections.length}`
    );
  }
}

module.exports = assertDisconnectionCount;
