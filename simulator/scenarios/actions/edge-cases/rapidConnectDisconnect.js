/**
 * Rapidly connect and disconnect clients
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Object} options.server - Server to connect to
 * @param {number} options.cycles - Number of connect/disconnect cycles
 * @param {number} [options.delayMs=0] - Delay between cycles (ms)
 * @returns {Promise<{completed: number, failed: number}>}
 *
 * @example
 * const { completed, failed } = await rapidConnectDisconnect({
 *   harness,
 *   server,
 *   cycles: 10
 * })
 */
async function rapidConnectDisconnect({ harness, server, cycles, delayMs = 0 }) {
  if (!harness) {
    throw new Error('rapidConnectDisconnect: harness required');
  }
  if (!server) {
    throw new Error('rapidConnectDisconnect: server required');
  }
  if (!cycles) {
    throw new Error('rapidConnectDisconnect: cycles required');
  }

  let completed = 0;
  let failed = 0;

  for (let i = 0; i < cycles; i++) {
    try {
      const client = await harness.createClientForServer(server);
      await client.disconnect();
      completed++;
    } catch (e) {
      failed++;
    }

    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { completed, failed };
}

module.exports = rapidConnectDisconnect;
