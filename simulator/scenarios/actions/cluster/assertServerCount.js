/**
 * Assert cluster has expected number of servers
 *
 * @param {Object} options - Options
 * @param {Array} options.servers - Server array
 * @param {number} options.count - Expected count
 * @returns {void}
 */
function assertServerCount({ servers, count }) {
  if (!Array.isArray(servers)) {
    throw new Error('assertServerCount: servers array required');
  }

  if (servers.length !== count) {
    throw new Error(
      `assertServerCount: expected ${count} servers but got ${servers.length}`
    );
  }
}

module.exports = assertServerCount;
