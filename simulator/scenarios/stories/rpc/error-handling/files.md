# Error Handling Test Scenario Files

Tests verifying that errors in controllers are properly returned to clients.

## Directory Structure

```
error-handling/
├── index.js
├── async-errors-handled.js
├── custom-error-codes-preserved.js
├── errors-returned-to-client.js
└── missing-endpoint-returns-error.js
```

## Files

### `index.js`

Test suite registration file that imports and registers all error handling tests.

### `async-errors-handled.js`

Tests that errors thrown in async controller methods are properly caught and returned to the client.

### `custom-error-codes-preserved.js`

Tests that custom error properties like codes and details are preserved when errors are returned to clients.

### `errors-returned-to-client.js`

Tests that generic errors thrown in controllers are returned to clients with the correct error message.

### `missing-endpoint-returns-error.js`

Tests that calling a non-existent endpoint returns an appropriate error.
