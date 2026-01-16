/**
 * Async Controllers tests
 */
const delayReturnsAfterTime = require('./delay-returns-after-time');
const multipleAsyncCallsIndependent = require('./multiple-async-calls-independent');

module.exports = function registerAsyncControllersTests({ describe, test, harness, expect }) {
  describe('Async Controllers', () => {
    test('delay controller returns after specified time', async () => {
      await delayReturnsAfterTime({ harness, expect });
    });

    test('multiple async calls complete independently', async () => {
      await multipleAsyncCallsIndependent({ harness, expect });
    });
  });
};
