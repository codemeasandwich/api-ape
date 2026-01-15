/**
 * Simple Calls tests
 */
const echoReturnsInputUnchanged = require('./echo-returns-input-unchanged');
const multipleSequentialCalls = require('./multiple-sequential-calls');

module.exports = function registerSimpleCallsTests({ describe, test, harness, expect }) {
  describe('Simple Calls', () => {
    test('echo returns input data unchanged', async () => {
      await echoReturnsInputUnchanged({ harness, expect });
    });

    test('multiple sequential calls work correctly', async () => {
      await multipleSequentialCalls({ harness, expect });
    });
  });
};
