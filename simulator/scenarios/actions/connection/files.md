# Connection Actions Module Files

This module provides atomic operations for managing client connections in api-ape tests. These actions handle the full connection lifecycle from connect to disconnect.

## Guidelines

- **Short timeouts** — Use 500ms connection timeout since everything is local
- **Clean disconnect** — Always disconnect clients before server shutdown
- **State verification** — Use `assertConnected()` after connect to ensure success
- **Batch efficiency** — Use `connectMany()` for multiple simultaneous connections

## Directory Structure

```
connection/
├── index.js               # Module entry point, re-exports all actions
├── connect.js             # Connect a single client to server
├── connectMany.js         # Connect multiple clients to server
├── disconnect.js          # Disconnect a single client
├── disconnectMany.js      # Disconnect multiple clients
├── reconnect.js           # Reconnect a disconnected client
├── getState.js            # Get client connection state
├── isConnected.js         # Check if client is connected
├── getClientCount.js      # Get server's connected client count
├── assertConnected.js     # Assert client is connected
├── assertDisconnected.js  # Assert client is disconnected
├── assertAllConnected.js  # Assert all clients are connected
├── assertAllDisconnected.js # Assert all clients are disconnected
└── waitForDisconnect.js   # Wait for client disconnect event
```

## Files

### `index.js`

Module entry point that re-exports all connection actions for convenient importing.

### `connect.js`

Connects a single client to a server. Returns the connected client instance.

### `connectMany.js`

Connects multiple clients to the same server. Returns array of client instances.

### `disconnect.js`

Cleanly disconnects a single client from the server.

### `disconnectMany.js`

Disconnects multiple clients from their servers.

### `reconnect.js`

Reconnects a previously disconnected client to the server.

### `getState.js`

Returns the current connection state string for a client.

### `isConnected.js`

Returns boolean indicating if client is currently connected.

### `getClientCount.js`

Returns the number of clients connected to a server.

### `assertConnected.js`

Asserts that a client is in the connected state. Throws if not.

### `assertDisconnected.js`

Asserts that a client is in the disconnected state. Throws if not.

### `assertAllConnected.js`

Asserts that all provided clients are connected. Throws if any are not.

### `assertAllDisconnected.js`

Asserts that all provided clients are disconnected. Throws if any are not.

### `waitForDisconnect.js`

Returns a promise that resolves when the client disconnects.
