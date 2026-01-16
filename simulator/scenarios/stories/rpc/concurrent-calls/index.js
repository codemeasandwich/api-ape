/**
 * Concurrent Calls tests
 */
const manyConcurrentCalls = require('./many-concurrent-calls');
const concurrentToDifferentEndpoints = require('./concurrent-to-different-endpoints');

module.exports = function registerConcurrentCallsTests({ describe, test, harness, expect }) {
  describe('Concurrent Calls', () => {
    test('many concurrent calls all complete correctly', async () => {
      await manyConcurrentCalls({ harness, expect });
    });

    test('concurrent calls to different endpoints', async () => {
      await concurrentToDifferentEndpoints({ harness, expect });
    });
  });
};
