# Edge Cases Actions Module Files

This module provides atomic operations for testing error conditions, boundary conditions, and unusual scenarios in api-ape. These actions help achieve full code coverage by exercising error paths.

## Guidelines

- **Expect failures** — Most edge case actions should trigger errors; use try/catch appropriately
- **Short timeouts** — Use very short timeouts (50-100ms) to test timeout paths quickly
- **Cleanup after stress** — Always cleanup after stress tests to avoid resource leaks
- **Document expectations** — Each action should document whether it expects success or failure

## Directory Structure

```
edge-cases/
├── index.js                  # Module entry point, re-exports all actions
├── callMissingEndpoint.js    # Call non-existent endpoint (expects error)
├── callWithTimeout.js        # Call with very short timeout (expects timeout)
├── callWithLargePayload.js   # Call with large data payload
├── callWithEmptyPayload.js   # Call with empty/null data
├── callWithNullValues.js     # Call with null values in data
├── callWithSpecialChars.js   # Call with special characters in data
├── callWithDeepNesting.js    # Call with deeply nested objects
├── callAfterDisconnect.js    # Call after client disconnected (expects error)
├── disconnectDuringCall.js   # Disconnect while call is pending
├── rapidCalls.js             # Many rapid sequential calls
├── rapidConnectDisconnect.js # Rapid connect/disconnect cycles
├── manyClientsStress.js      # Stress test with many simultaneous clients
└── broadcastToEmpty.js       # Broadcast when no clients connected
```

## Files

### `index.js`

Module entry point that re-exports all edge case actions for convenient importing.

### `callMissingEndpoint.js`

Calls a non-existent endpoint to test 404-equivalent error handling.

### `callWithTimeout.js`

Calls an endpoint with a very short timeout to test timeout error handling.

### `callWithLargePayload.js`

Calls an endpoint with a large payload (configurable size) to test chunking/buffer handling.

### `callWithEmptyPayload.js`

Calls an endpoint with empty or null payload to test null handling.

### `callWithNullValues.js`

Calls an endpoint with null values in the data object.

### `callWithSpecialChars.js`

Calls an endpoint with special characters to test encoding.

### `callWithDeepNesting.js`

Calls an endpoint with deeply nested object structures.

### `callAfterDisconnect.js`

Attempts to call after client is disconnected to test error handling.

### `disconnectDuringCall.js`

Disconnects client while a call is in progress to test pending request handling.

### `rapidCalls.js`

Makes many rapid sequential calls to test query ID management.

### `rapidConnectDisconnect.js`

Rapidly connects and disconnects to test connection cleanup.

### `manyClientsStress.js`

Creates many simultaneous clients to stress test the server.

### `broadcastToEmpty.js`

Broadcasts when no clients are connected to verify silent success.
