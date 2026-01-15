const createServerWithEmbed = require('./createServerWithEmbed');
const assertConnectionCount = require('./assertConnectionCount');
const assertDisconnectionCount = require('./assertDisconnectionCount');
const waitForConnections = require('./waitForConnections');
const waitForDisconnections = require('./waitForDisconnections');
const getEventSnapshot = require('./getEventSnapshot');
const clearEvents = require('./clearEvents');

/**
 * Create a test scenario with full lifecycle tracking
 *
 * Sets up server with all hooks tracked and returns helper functions.
 *
 * @param {Object} options - Options
 * @param {Object} options.harness - Harness instance
 * @param {Object} [options.embed] - Embed values
 * @param {string} [options.where='controllers'] - Controller directory
 * @returns {Promise<Object>} Test context with server, events, and helpers
 *
 * @example
 * const ctx = await createTestContext({ harness, embed: { userId: '123' } })
 * const client = await ctx.connectClient()
 * await ctx.assertConnected(1)
 * await client.disconnect()
 * await ctx.assertDisconnected(1)
 */
async function createTestContext({ harness, embed, where = 'controllers' }) {
  const { server, events } = await createServerWithEmbed({
    harness,
    embed,
    where,
  });

  return {
    server,
    events,

    async connectClient(options = {}) {
      return harness.createClientForServer(server, options);
    },

    assertConnected(count) {
      assertConnectionCount({ events, count });
    },

    assertDisconnected(count) {
      assertDisconnectionCount({ events, count });
    },

    async waitConnected(count, timeout = 500) {
      return waitForConnections({ events, count, timeout });
    },

    async waitDisconnected(count, timeout = 500) {
      return waitForDisconnections({ events, count, timeout });
    },

    getSnapshot() {
      return getEventSnapshot({ events });
    },

    clear() {
      clearEvents({ events });
    },
  };
}

module.exports = createTestContext;
