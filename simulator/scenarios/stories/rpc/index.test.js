/**
 * @fileoverview RPC User Stories - Complete RPC testing scenarios
 *
 * Tests all RPC functionality through api-ape's public interface:
 * - Simple calls
 * - Nested routes
 * - Concurrent calls
 * - Error handling
 * - JSS types round-trip
 * - Async controllers
 *
 * @module simulator/scenarios/stories/rpc
 */

const { Harness } = require('../../../harness');

// Import individual test functions
const echoReturnsInputUnchanged = require('./simple-calls/echo-returns-input-unchanged');
const multipleSequentialCalls = require('./simple-calls/multiple-sequential-calls');
const usersEndpointReturnsList = require('./nested-routes/users-endpoint-returns-list');
const usersEndpointFiltersByRole = require('./nested-routes/users-endpoint-filters-by-role');
const usersProfileReturnsContext = require('./nested-routes/users-profile-returns-context');
const nestedIndexMapsToParent = require('./nested-routes/nested-index-maps-to-parent');
const deepNestedIndexMaps = require('./nested-routes/deep-nested-index-maps');
const threeLevelDeepRoute = require('./nested-routes/three-level-deep-route');
const fourLevelDeepRoute = require('./nested-routes/four-level-deep-route');
const delayReturnsAfterTime = require('./async-controllers/delay-returns-after-time');
const multipleAsyncCallsIndependent = require('./async-controllers/multiple-async-calls-independent');
const errorsReturnedToClient = require('./error-handling/errors-returned-to-client');
const customErrorCodesPreserved = require('./error-handling/custom-error-codes-preserved');
const asyncErrorsHandled = require('./error-handling/async-errors-handled');
const missingEndpointReturnsError = require('./error-handling/missing-endpoint-returns-error');
const dateSurvivesRoundtrip = require('./jss-types/date-survives-roundtrip');
const regexpSurvivesRoundtrip = require('./jss-types/regexp-survives-roundtrip');
const setSurvivesRoundtrip = require('./jss-types/set-survives-roundtrip');
const mapSurvivesRoundtrip = require('./jss-types/map-survives-roundtrip');
const complexNestedTypes = require('./jss-types/complex-nested-types');
const errorSurvivesRoundtrip = require('./jss-types/error-survives-roundtrip');
const typeErrorSurvivesRoundtrip = require('./jss-types/typeerror-survives-roundtrip');
const undefinedSurvivesRoundtrip = require('./jss-types/undefined-survives-roundtrip');
const regexpNoFlags = require('./jss-types/regexp-no-flags');
const arrayOfTypedValues = require('./jss-types/array-of-typed-values');
const manyConcurrentCalls = require('./concurrent-calls/many-concurrent-calls');
const concurrentToDifferentEndpoints = require('./concurrent-calls/concurrent-to-different-endpoints');

// Short timeouts for local testing
jest.setTimeout(5000);

describe('RPC User Stories', () => {
  let harness;

  beforeEach(() => {
    jest.resetModules();
    harness = new Harness({ basePort: 10000 });
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  describe('Simple Calls', () => {
    test('echo returns input data unchanged', async () => {
      await echoReturnsInputUnchanged({ harness, expect });
    });

    test('multiple sequential calls work correctly', async () => {
      await multipleSequentialCalls({ harness, expect });
    });
  });

  describe('Nested Routes', () => {
    test('users endpoint returns list', async () => {
      await usersEndpointReturnsList({ harness, expect });
    });

    test('users endpoint filters by role', async () => {
      await usersEndpointFiltersByRole({ harness, expect });
    });

    test('users/profile returns profile with context', async () => {
      await usersProfileReturnsContext({ harness, expect });
    });

    test('nested directory index.js maps to parent path', async () => {
      await nestedIndexMapsToParent({ harness, expect });
    });

    test('deep nested index.js maps correctly', async () => {
      await deepNestedIndexMaps({ harness, expect });
    });

    test('3-level deep route resolves correctly', async () => {
      await threeLevelDeepRoute({ harness, expect });
    });

    test('4-level deep route resolves correctly', async () => {
      await fourLevelDeepRoute({ harness, expect });
    });
  });

  describe('Async Controllers', () => {
    test('delay controller returns after specified time', async () => {
      await delayReturnsAfterTime({ harness, expect });
    });

    test('multiple async calls complete independently', async () => {
      await multipleAsyncCallsIndependent({ harness, expect });
    });
  });

  describe('Error Handling', () => {
    test('errors are properly returned to client', async () => {
      await errorsReturnedToClient({ harness, expect });
    });

    test('custom error codes are preserved', async () => {
      await customErrorCodesPreserved({ harness, expect });
    });

    test('async errors are handled correctly', async () => {
      await asyncErrorsHandled({ harness, expect });
    });

    test('missing endpoint returns error', async () => {
      await missingEndpointReturnsError({ harness, expect });
    });
  });

  describe('JSS Types', () => {
    test('Date survives round-trip', async () => {
      await dateSurvivesRoundtrip({ harness, expect });
    });

    test('RegExp survives round-trip', async () => {
      await regexpSurvivesRoundtrip({ harness, expect });
    });

    test('Set survives round-trip', async () => {
      await setSurvivesRoundtrip({ harness, expect });
    });

    test('Map survives round-trip', async () => {
      await mapSurvivesRoundtrip({ harness, expect });
    });

    test('complex nested types survive round-trip', async () => {
      await complexNestedTypes({ harness, expect });
    });

    test('Error survives round-trip', async () => {
      await errorSurvivesRoundtrip({ harness, expect });
    });

    test('TypeError survives round-trip', async () => {
      await typeErrorSurvivesRoundtrip({ harness, expect });
    });

    test('undefined survives round-trip', async () => {
      await undefinedSurvivesRoundtrip({ harness, expect });
    });

    test('RegExp without flags survives round-trip', async () => {
      await regexpNoFlags({ harness, expect });
    });

    test('array of typed values survives round-trip', async () => {
      await arrayOfTypedValues({ harness, expect });
    });
  });

  describe('Concurrent Calls', () => {
    test('many concurrent calls all complete correctly', async () => {
      await manyConcurrentCalls({ harness, expect });
    });

    test('concurrent calls to different endpoints', async () => {
      await concurrentToDifferentEndpoints({ harness, expect });
    });
  });
});
