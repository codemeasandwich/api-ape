# Lifecycle Actions Module Files

This module provides atomic operations for testing api-ape's server lifecycle hooks and callbacks. These actions test the `onConnect` callback, embed values, and disconnect handling.

## Guidelines

- **Event tracking** — Use `createTestContext()` to set up event tracking for verification
- **Cleanup** — Always cleanup servers to avoid orphaned event listeners
- **Timing** — Lifecycle events fire synchronously; no wait needed after connect/disconnect
- **Embed immutability** — Embed values are set once at connection time

## Directory Structure

```
lifecycle/
├── index.js                      # Module entry point, re-exports all actions
├── createServerWithEmbed.js      # Create server with static embed values
├── createServerWithDynamicEmbed.js # Create server with per-request embed
├── createServerWithWelcome.js    # Create server that sends welcome message
├── createTestContext.js          # Create context for tracking lifecycle events
├── verifyEmbed.js                # Verify embed values accessible in controller
├── verifyDisconnect.js           # Verify onDisconnect callback fired
├── verifyReceiveHook.js          # Verify onReceive callback fired
├── connectAndExpectWelcome.js    # Connect and wait for welcome message
├── getEventSnapshot.js           # Get current state of tracked events
├── clearEvents.js                # Clear tracked events
├── assertConnectionCount.js      # Assert number of onConnect calls
├── assertDisconnectionCount.js   # Assert number of onDisconnect calls
├── waitForConnections.js         # Wait for N clients to connect
└── waitForDisconnections.js      # Wait for N clients to disconnect
```

## Files

### `index.js`

Module entry point that re-exports all lifecycle actions for convenient importing.

### `createServerWithEmbed.js`

Creates a server with `onConnect` that returns static embed values.

### `createServerWithDynamicEmbed.js`

Creates a server with `onConnect` that computes embed values per request.

### `createServerWithWelcome.js`

Creates a server that sends a welcome message to each connecting client.

### `createTestContext.js`

Creates a test context object that tracks lifecycle events for verification.

### `verifyEmbed.js`

Verifies that embed values are accessible via `this.*` in controllers.

### `verifyDisconnect.js`

Verifies that the `onDisconnect` callback was called when expected.

### `verifyReceiveHook.js`

Verifies that the `onReceive` callback was called for incoming messages.

### `connectAndExpectWelcome.js`

Connects a client and waits for the welcome message.

### `getEventSnapshot.js`

Returns current snapshot of all tracked lifecycle events.

### `clearEvents.js`

Clears all tracked lifecycle events for fresh test phase.

### `assertConnectionCount.js`

Asserts that exactly N `onConnect` callbacks have fired.

### `assertDisconnectionCount.js`

Asserts that exactly N `onDisconnect` callbacks have fired.

### `waitForConnections.js`

Waits until N clients have connected (useful for timing).

### `waitForDisconnections.js`

Waits until N clients have disconnected (useful for timing).
