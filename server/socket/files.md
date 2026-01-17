# Socket Module Files

This module handles WebSocket message processing for api-ape servers. It manages the complete lifecycle of messages flowing between clients and controllers—from initial connection validation through message parsing, controller invocation, and response serialization.

## Guidelines

- **JSS encoding** — Always use `utils/jss` for message parsing/serialization; never raw `JSON.parse/stringify`
- **QueryId correlation** — Every response must include the original `queryId` for client-side Promise resolution
- **Binary tag system** — Use `tagUtils.js` for all binary data detection; don't implement custom tag parsing
- **Controller context** — Controllers receive `this` with `clientId`, `broadcast`, `send`, and embedded data
- **Error handling** — Catch all controller errors and send error responses; never let exceptions crash the connection
- **Security first** — All connections must pass `open.js` validation before processing messages

## Directory Structure

```
socket/
├── authMiddleware.js  # Authorization middleware for endpoint access control
├── open.js            # Connection validation & security check
├── receive.js         # Incoming message handler
├── receiveContext.js  # Controller context factory
├── send.js            # Outgoing message handler
└── tagUtils.js        # Binary data tag parsing utilities
```

## Files

### `authMiddleware.js`

Authorization middleware for endpoint access control:

- Checks auth tier requirements before controller invocation
- Supports wildcard endpoint patterns (`admin/*`, `*`)
- Permission and role-based authorization with `requireAll` option
- Configurable per-endpoint requirements via `setRequirement()`
- Creates standard `authz_fail` responses for unauthorized requests

### `open.js`

Connection open handler called when a new WebSocket connection is established:

- Validates the connection origin against the host (CSRF protection)
- Delegates to `security/origin.js` for origin verification
- Returns `true` if connection is allowed, `false` to reject

### `receive.js`

Incoming message handler that processes client requests:

- Parses incoming WebSocket messages (JSS encoded JSON)
- Handles `subscribe` and `unsubscribe` messages for pub/sub channels
- Extracts `type`, `data`, and `queryId` from the message
- Detects binary upload tags (`<!B>`, `<!A>`, `<!F>`) in the message
- Coordinates with `fileTransfer` to wait for HTTP uploads
- Injects uploaded binary data into the message at the tagged paths
- Invokes the appropriate controller with the complete message
- Handles errors and sends error responses back to the client

### `send.js`

Outgoing message handler that serializes and sends responses:

- Serializes controller return values using JSS encoding
- Detects Buffer/ArrayBuffer values in responses
- Replaces binary data with `<!L>` (link) tags for client download
- Registers binary data with `fileTransfer` for HTTP download
- Sends the serialized response with matching `queryId`

### `receiveContext.js`

Controller context factory that creates the `this` binding for controllers:

- Extracts session ID from request cookies
- Provides `broadcast()` and `broadcastOthers()` for messaging all clients
- Provides `publish()` for pub/sub channel messaging
- Exposes `clientId`, `sessionId`, and `clients` Map
- When auth is configured, adds `isAuthenticated`, `authTier`, `principal`, and `requiresTier()`

### `tagUtils.js`

Utilities for parsing and processing binary data tags:

- `findUploadTags(obj)` — Find all `<!B>` and `<!A>` tags with their paths
- `findFileTags(obj)` — Find all `<!F>` tags for streaming transfers
- `cleanUploadTags(obj)` — Remove tag suffixes from object keys
- `setValueAtPath(obj, path, value)` — Inject values at dot-notation paths