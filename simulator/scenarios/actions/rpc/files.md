# RPC Actions Module Files

This module provides atomic operations for testing api-ape's Remote Procedure Call functionality. These actions cover making API calls, handling responses, and error scenarios.

## Guidelines

- **Short timeouts** — Use 1000ms request timeout for local testing
- **QueryId matching** — Client generates queryId using same hash as server
- **Error assertions** — Use `callAndExpectError()` for expected failures
- **Concurrent safety** — Concurrent calls use unique queryIds automatically

## Directory Structure

```
rpc/
├── index.js              # Module entry point, re-exports all actions
├── call.js               # Make a single API call
├── callNested.js         # Call a nested route endpoint
├── callSequential.js     # Make multiple calls sequentially
├── callConcurrent.js     # Make multiple calls in parallel
├── callAndExpect.js      # Call and assert response matches expected
├── callAndExpectError.js # Call and expect error response
├── callWithRetry.js      # Call with retry on failure
├── assertCallSucceeds.js # Assert call completes without error
├── assertCallFails.js    # Assert call returns error
├── assertCallTime.js     # Assert call completes within time limit
└── measureCallTime.js    # Measure round-trip time for a call
```

## Files

### `index.js`

Module entry point that re-exports all RPC actions for convenient importing.

### `call.js`

Makes a single API call to an endpoint. Returns the response data.

### `callNested.js`

Calls a nested route endpoint (e.g., `users/profile`). Handles path formatting.

### `callSequential.js`

Makes multiple calls sequentially, waiting for each to complete before the next.

### `callConcurrent.js`

Makes multiple calls in parallel using Promise.all. Returns array of results.

### `callAndExpect.js`

Makes a call and asserts the response matches expected data.

### `callAndExpectError.js`

Makes a call expecting it to fail. Asserts error message contains expected text.

### `callWithRetry.js`

Makes a call with automatic retry on failure, up to specified max attempts.

### `assertCallSucceeds.js`

Asserts that a call completes without throwing an error.

### `assertCallFails.js`

Asserts that a call throws an error.

### `assertCallTime.js`

Asserts that a call completes within the specified time limit.

### `measureCallTime.js`

Measures and returns the round-trip time for an API call in milliseconds.
