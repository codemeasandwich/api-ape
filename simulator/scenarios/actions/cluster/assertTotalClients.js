const getTotalClientCount = require('./getTotalClientCount');

/**
 * Assert total clients across cluster
 *
 * @param {Object} options - Options
 * @param {Array} options.servers - Server array
 * @param {number} options.count - Expected total client count
 * @returns {void}
 */
function assertTotalClients({ servers, count }) {
  const total = getTotalClientCount({ servers });
  if (total !== count) {
    throw new Error(
      `assertTotalClients: expected ${count} total clients but got ${total}`
    );
  }
}

module.exports = assertTotalClients;
