/**
 * Wait for database to sync across cluster
 *
 * In the virtual environment, this is instant, but provides
 * a semantic checkpoint for tests.
 *
 * @param {Object} options - Options
 * @param {number} [options.timeout=50] - Max wait time (ms)
 * @returns {Promise<void>}
 */
async function waitForDatabaseSync({ timeout = 50 } = {}) {
  await new Promise((r) => setTimeout(r, timeout));
}

module.exports = waitForDatabaseSync;
