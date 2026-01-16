# Lifecycle Stories Module Files

This module contains test suites for api-ape's connection lifecycle functionality. These tests verify `onConnect` callbacks, embed values, hooks, and disconnect handling.

## Guidelines

- **Event timing** — Lifecycle events fire synchronously; no waits needed
- **Embed immutability** — Embed values are set once at connection
- **Hook ordering** — onConnect runs before first message; onDisconnect after close
- **Client count** — Use `server.clientCount` to verify tracking

## Directory Structure

```
lifecycle/
├── index.test.js              # Main test file that imports all scenarios
├── connection-states/         # Tests for client state transitions
├── controller-context/        # Tests for this.* values in controllers
├── on-connect-welcome-message/ # Tests for sending messages on connect
├── on-connect-with-embed/     # Tests for embed values
├── on-disconnect-callback/    # Tests for disconnect handling
└── server-client-tracking/    # Tests for server's client count tracking
```

## Directories

### `connection-states/`

Tests for client connection state transitions (disconnected → connecting → connected).

### `controller-context/`

Tests verifying `this.clientId` and other context values are accessible in controllers.

### `on-connect-welcome-message/`

Tests for servers that send welcome messages to connecting clients via the `send` function.

### `on-connect-with-embed/`

Tests for embedding custom data that becomes available as `this.*` in controllers.

### `on-disconnect-callback/`

Tests verifying the `onDisconnect` callback fires when clients disconnect.

### `server-client-tracking/`

Tests verifying the server accurately tracks connected client count.
