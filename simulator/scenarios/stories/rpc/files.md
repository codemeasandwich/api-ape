# RPC Stories Module Files

This module contains test suites for api-ape's Remote Procedure Call functionality. These tests cover the core request/response mechanism that powers api-ape.

## Guidelines

- **Short timeouts** — Use 1000ms request timeout for local testing
- **Echo controller** — Most tests use an echo controller that returns input unchanged
- **Error testing** — Use dedicated error controller for error scenario tests
- **JSS verification** — Use `instanceof` checks to verify type reconstruction

## Directory Structure

```
rpc/
├── index.test.js        # Main test file that imports all scenarios
├── simple-calls/        # Basic request/response tests
├── nested-routes/       # Deep path routing tests
├── async-controllers/   # Async controller tests
├── error-handling/      # Error response tests
├── jss-types/           # JSS type serialization tests
└── concurrent-calls/    # Simultaneous request tests
```

## Directories

### `simple-calls/`

Tests for basic request/response functionality including echo and sequential calls.

### `nested-routes/`

Tests for deeply nested endpoint paths like `users/profile` and `nested/deep/very/handler`.

### `async-controllers/`

Tests for controllers that return promises, including delay testing.

### `error-handling/`

Tests for error responses including thrown errors, custom error codes, and missing endpoints.

### `jss-types/`

Tests for JSS type serialization including Date, RegExp, Error, Set, Map, and undefined.

### `concurrent-calls/`

Tests for multiple simultaneous requests verifying queryId correlation works correctly.
