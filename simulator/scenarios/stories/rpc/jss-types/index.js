/**
 * JSS Types tests
 */
const dateSurvivesRoundtrip = require('./date-survives-roundtrip');
const regexpSurvivesRoundtrip = require('./regexp-survives-roundtrip');
const setSurvivesRoundtrip = require('./set-survives-roundtrip');
const mapSurvivesRoundtrip = require('./map-survives-roundtrip');
const complexNestedTypes = require('./complex-nested-types');
const errorSurvivesRoundtrip = require('./error-survives-roundtrip');
const typeErrorSurvivesRoundtrip = require('./typeerror-survives-roundtrip');
const undefinedSurvivesRoundtrip = require('./undefined-survives-roundtrip');
const regexpNoFlags = require('./regexp-no-flags');
const arrayOfTypedValues = require('./array-of-typed-values');

module.exports = function registerJssTypesTests({ describe, test, harness, expect }) {
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
};
