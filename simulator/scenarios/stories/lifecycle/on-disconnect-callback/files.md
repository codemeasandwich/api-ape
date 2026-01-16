# On Disconnect Callback Test Scenario Files

Tests verifying that the `onDisconnect` callback is called when clients disconnect.

## Directory Structure

```
on-disconnect-callback/
├── on-disconnect-called-for-each-disconnecting-client.js
└── on-disconnect-fires-when-client-disconnects.js
```

## Files

### `on-disconnect-called-for-each-disconnecting-client.js`

Tests that `onDisconnect` is called once for each client that disconnects, tracking the correct count across multiple disconnections.

### `on-disconnect-fires-when-client-disconnects.js`

Tests that the `onDisconnect` callback returned from `onConnect` fires when a client disconnects from the server.
