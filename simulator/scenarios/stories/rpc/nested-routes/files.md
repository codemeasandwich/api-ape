# Nested Routes Test Scenario Files

Tests verifying that nested directory routes resolve correctly.

## Directory Structure

```
nested-routes/
├── index.js
├── deep-nested-index-maps.js
├── four-level-deep-route.js
├── nested-index-maps-to-parent.js
├── three-level-deep-route.js
├── users-endpoint-filters-by-role.js
├── users-endpoint-returns-list.js
└── users-profile-returns-context.js
```

## Files

### `index.js`

Test suite registration file that imports and registers all nested routes tests.

### `deep-nested-index-maps.js`

Tests that `nested/deep/index.js` correctly maps to the `nested/deep` route path.

### `four-level-deep-route.js`

Tests that a 4-level deep route (`nested/deep/very/handler`) resolves correctly.

### `nested-index-maps-to-parent.js`

Tests that `nested/index.js` correctly maps to the `nested` route path.

### `three-level-deep-route.js`

Tests that a 3-level deep route (`nested/deep/handler`) resolves correctly.

### `users-endpoint-filters-by-role.js`

Tests that the users endpoint correctly filters results when a role parameter is provided.

### `users-endpoint-returns-list.js`

Tests that the users endpoint returns a list of users with a total count.

### `users-profile-returns-context.js`

Tests that the `users/profile` nested route returns profile data with the clientId from context.
