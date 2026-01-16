/**
 * Error Handling tests
 */
const errorsReturnedToClient = require('./errors-returned-to-client');
const customErrorCodesPreserved = require('./custom-error-codes-preserved');
const asyncErrorsHandled = require('./async-errors-handled');
const missingEndpointReturnsError = require('./missing-endpoint-returns-error');

module.exports = function registerErrorHandlingTests({ describe, test, harness, expect, fail }) {
  describe('Error Handling', () => {
    test('errors are properly returned to client', async () => {
      await errorsReturnedToClient({ harness, expect });
    });

    test('custom error codes are preserved', async () => {
      await customErrorCodesPreserved({ harness, expect, fail });
    });

    test('async errors are handled correctly', async () => {
      await asyncErrorsHandled({ harness, expect });
    });

    test('missing endpoint returns error', async () => {
      await missingEndpointReturnsError({ harness, expect });
    });
  });
};
