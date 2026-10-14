# Socket Module Files

This module handles WebSocket message processing for api-ape servers. It manages the complete lifecycle of messages flowing between clients and controllers—from initial connection validation through message parsing, controller invocation, and response serialization.

## Guidelines

- **JSS encoding** — Always use `utils/jss` for message parsing/serialization; never raw `JSON.parse/stringify`
- **QueryId correlation** — Every response must include the original `queryId` for client-side Promise resolution
- **Binary tag system** — Use `tagUtils.js` for all binary data detection; don't implement custom tag parsing
- **Controller context** — Controllers receive `this` with `clientId`, `broadcast`, `send`, and embedded data
- **Error handling** — Catch all controller errors and send error responses; never let exceptions crash the connection
- **Security first** — All connections must pass `open.js` validation before processing messages
- **Peer text is data** — Frame types, keys and path segments are looked up with `utils/safeKeys.js` (`hasOwn`, `setKey`), never `obj[name]`: `controllers[type]` must not find `valueOf` or `constructor`

## Directory Structure

```
socket/
├── authMiddleware.js  # Authorization middleware for endpoint access control
├── open.js            # Connection validation & security check
├── pluginHooks.js     # Plugin onSend/onReceive hooks around JSS (resolve plugin-tagged values)
├── receive.js         # Incoming message handler
├── subscribeGate.js   # Subscribe authorisation (`onSubscribe`) for one connection
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
- Routes `subscribe` and `unsubscribe` messages for pub/sub channels to `subscribeGate.js`
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

### `pluginHooks.js`

Runs JSS plugin hooks around the wire: `processPluginSend` before a reply is encoded, `processPluginReceive` after a frame is decoded (finds `<!X>` plugin tags, calls the plugin's `onReceive`, injects the result with `setValueAtPath` from `tagUtils.js`), plus `findPluginTags` and `cleanPluginTags`. Peer keys are written with `setKey`, so a `__proto__` key cannot replace a prototype.

### `subscribeGate.js`

Per-connection handler for `{ subscribe }` / `{ unsubscribe }` frames. Without the `onSubscribe` option it subscribes and replays the retained message at once (the 4.4.0 behaviour). With it, it asks `onSubscribe(channel, { clientId, sessionId, embed })` first and subscribes and replays only on exactly `true` (fail closed: false, undefined, a throw, a rejection, a non-boolean or a non-string channel all refuse). A refusal sends `__subscribe_refused__` (an error frame: `errCode` `SUBSCRIBE_REFUSED`, `errData` `{ channel }`, no cause) and drops a subscription already held on the channel. Pending checks hold a token per channel so a late answer after an unsubscribe, a newer subscribe or a socket close records nothing.

### `receiveContext.js`

Controller context factory that creates the `this` binding for controllers:

- Extracts session ID from request cookies
- Provides `broadcast()` and `broadcastOthers()` for messaging all clients (declared before the app's `embed`, so an app's own `broadcast` wins)
- Provides `publish()` for pub/sub channel messaging
- Exposes `clientId`, `sessionId`, and `clients` Map
- `createCallContext(connectionContext, queryId, send)` layers ONE call's `keepalive` (and `_currentQueryId`) over the connection's context; the WebSocket receive handler and the HTTP long-poll POST handler both use it, so a controller behaves the same on either transport
- When auth is configured, adds `isAuthenticated`, `authTier`, `principal`, and `requiresTier()`

### `tagUtils.js`

Utilities for parsing and processing binary data tags:

- `findUploadTags(obj)` — Find all `<!B>` and `<!A>` tags with their paths
- `findFileTags(obj)` — Find all `<!F>` tags for streaming transfers
- `cleanUploadTags(obj)` — Remove tag suffixes from object keys
- `setValueAtPath(obj, path, value)` — Inject values at dot-notation paths. The path is built from keys a peer chose, so it follows own properties only and throws when a segment is missing or goes through a non-object (a `constructor.prototype.x` field name can no longer reach `Object.prototype`)