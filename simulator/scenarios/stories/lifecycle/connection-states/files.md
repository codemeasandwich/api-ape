# Connection States Test Scenario Files

Tests verifying client connection state transitions.

## Directory Structure

```
connection-states/
├── client-becomes-disconnected-after-disconnect.js
├── client-starts-connected-after-create-pair.js
└── disconnected-event-fires-on-disconnect.js
```

## Files

### `client-becomes-disconnected-after-disconnect.js`

Tests that a client's `connected` property becomes false and state changes to 'disconnected' after calling `disconnect()`.

### `client-starts-connected-after-create-pair.js`

Tests that a client is immediately in the 'connected' state after being created with `harness.createPair()`.

### `disconnected-event-fires-on-disconnect.js`

Tests that the 'disconnected' event is fired on the client when `disconnect()` is called.
