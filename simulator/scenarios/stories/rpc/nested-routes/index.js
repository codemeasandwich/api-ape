/**
 * Nested Routes tests
 */
const usersEndpointReturnsList = require('./users-endpoint-returns-list');
const usersEndpointFiltersByRole = require('./users-endpoint-filters-by-role');
const usersProfileReturnsContext = require('./users-profile-returns-context');
const nestedIndexMapsToParent = require('./nested-index-maps-to-parent');
const deepNestedIndexMaps = require('./deep-nested-index-maps');
const threeLevelDeepRoute = require('./three-level-deep-route');
const fourLevelDeepRoute = require('./four-level-deep-route');

module.exports = function registerNestedRoutesTests({ describe, test, harness, expect }) {
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
};
