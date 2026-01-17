# Test API Controllers Module Files

This module contains test controllers that api-ape loads during testing. These are minimal implementations designed to exercise specific framework features.

## Guidelines

- **Minimal implementation** — Controllers should do the minimum needed to test the feature
- **Document purpose** — Each controller should have a brief JSDoc explaining its test purpose
- **Use context** — Access `this.clientId`, `this.clients`, etc. as needed for tests
- **No side effects** — Controllers should be stateless and idempotent

## Directory Structure

```
test-api/
├── echo.js           # Returns input unchanged (basic RPC)
├── message.js        # Sends message to other clients
├── delay.js          # Async controller with configurable delay
├── errors.js         # Throws various error types
├── types.js          # Returns JSS types for serialization testing
├── circular.js       # Tests circular reference handling
├── runtime.js        # Runtime detection and send-to-all testing
├── broadcast-test.js # Tests clients proxy behavior
├── users/            # Nested route examples
│   ├── index.js      # User list endpoint
│   └── profile.js    # User profile endpoint
├── files/            # Binary transfer controllers
│   ├── upload.js     # File upload handler
│   └── download.js   # File download handler
└── nested/           # Deep nesting for routing tests
    ├── index.js      # Maps to 'nested' endpoint
    └── deep/
        ├── index.js  # Maps to 'nested/deep' endpoint
        ├── handler.js # Maps to 'nested/deep/handler' endpoint
        └── very/
            └── handler.js # Maps to 'nested/deep/very/handler'
```

## Files

### `echo.js`

Returns whatever data is sent to it unchanged. Used for basic RPC and JSS round-trip testing.

### `message.js`

Sends the received message to all other connected clients using `this.clients.forEach()`.

### `delay.js`

Async controller that waits for a specified time before responding. Used for async and timeout testing.

### `errors.js`

Throws various error types based on input. Used for error handling and propagation testing.

### `types.js`

Returns various JSS types (Date, RegExp, Error, Set, Map) for serialization testing.

### `circular.js`

Tests handling of circular object references in serialization.

### `runtime.js`

Tests runtime detection (Node/Bun/Deno) and provides a send-to-all action for testing `this.clients`.

### `broadcast-test.js`

Tests the clients proxy behavior including read operations (size, forEach, get, has, keys, values, entries), client wrapper properties (sessionId, agent), the send method, and mutation blocking (set, delete, clear should throw).

### `users/`

Example of nested routes. `users/index.js` returns user list, `users/profile.js` returns profile data using embedded context.

### `files/`

Binary file transfer handlers. `upload.js` receives binary data, `download.js` sends binary data.

### `nested/`

Deep nesting structure for testing path resolution. Tests that `index.js` maps to parent path correctly at multiple levels.
