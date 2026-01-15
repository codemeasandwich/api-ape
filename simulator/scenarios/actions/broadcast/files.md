# Broadcast Actions Module Files

This module provides atomic operations for sending and verifying broadcast messages in api-ape tests. Broadcasts are server-pushed messages to connected clients.

## Guidelines

- **Instant execution** — All broadcasts deliver immediately in local testing
- **Buffer management** — Use `clearReceived()` between test phases to avoid stale messages
- **Timeout awareness** — `expectReceived()` has short default timeout; adjust if needed
- **Type matching** — Message types must match exactly (case-sensitive)

## Directory Structure

```
broadcast/
├── index.js                  # Module entry point, re-exports all actions
├── toAll.js                  # Broadcast to all connected clients
├── toOthers.js               # Broadcast to all except sender
├── expectReceived.js         # Assert client received specific message type
├── expectReceivedWithData.js # Assert receipt with data matching
├── expectNotReceived.js      # Assert client did NOT receive message
├── expectAllReceived.js      # Assert all clients received message
├── expectNoneReceived.js     # Assert no clients received message
├── verifyBroadcastAll.js     # Compound: send + verify all received
├── verifyBroadcastOthers.js  # Compound: send + verify others received
├── getReceived.js            # Get messages of specific type from buffer
├── clearReceived.js          # Clear client's message buffer
├── countReceived.js          # Count messages of specific type
├── listen.js                 # Register handler for message type
├── listenAll.js              # Register handler for all messages
└── assertReceivedCount.js    # Assert exact count of received messages
```

## Files

### `index.js`

Module entry point that re-exports all broadcast actions for convenient importing.

### `toAll.js`

Broadcasts a message to all connected clients via `server.broadcast()`.

### `toOthers.js`

Triggers a broadcast to all clients except the sender via `this.broadcastOthers()` in a controller.

### `expectReceived.js`

Waits for and asserts that a client received a message of the specified type.

### `expectReceivedWithData.js`

Like `expectReceived()` but also verifies the message data matches expected values.

### `expectNotReceived.js`

Asserts that a client did NOT receive a message of the specified type within timeout.

### `expectAllReceived.js`

Asserts that all provided clients received a message of the specified type.

### `expectNoneReceived.js`

Asserts that none of the provided clients received a message of the specified type.

### `verifyBroadcastAll.js`

Compound action: sends a broadcast and verifies all clients received it.

### `verifyBroadcastOthers.js`

Compound action: sends a broadcast and verifies all clients except sender received it.

### `getReceived.js`

Returns all messages of a specific type from a client's message buffer.

### `clearReceived.js`

Clears a client's received message buffer.

### `countReceived.js`

Returns the count of messages of a specific type in a client's buffer.

### `listen.js`

Registers a handler function for a specific message type on a client.

### `listenAll.js`

Registers a handler function for all incoming messages on a client.

### `assertReceivedCount.js`

Asserts that a client received exactly N messages of a specific type.
