# Connection Module Files

This module handles the core mechanics of maintaining a WebSocket connection to an api-ape server. It manages connection state, message sending, request/response correlation, and binary file transfers.

## Guidelines

- **Browser-safe only** — All code must run in browsers without Node.js APIs
- **State consistency** — Connection state changes must flow through `state.js`
- **QueryId correlation** — All requests must use `sender.js` for proper response matching
- **Binary handling** — File transfers use the tag system (`<!B>`, `<!A>`, `<!L>`) — coordinate with `fileHandling.js`
- **Network detection** — Changes to connectivity detection should account for captive portals

## Directory Structure

```
connection/
├── fileDownload.js    # Binary file download handling
├── fileHandling.js    # File upload/download coordination
├── fileUtils.js       # File transfer utilities
├── messageHandler.js  # Message processing and dispatch
├── network.js         # Network state detection & WebSocket URL (`getSocketUrl` / resume query)
├── reconnectBackoff.js # Phase 1: reconnect delay math shared policy with Node client
├── proxy.js           # Proxy-based API generation
├── sender.js          # Message sending with queryId correlation
├── state.js           # Connection state machine
└── subscriptions.js   # Pub/sub subscription manager
```

## Files

### `proxy.js`

Creates the Proxy-based API that allows `api.users.list()` syntax. Intercepts property access and method calls, converting them into WebSocket messages with the appropriate endpoint path.

### `sender.js`

Handles message serialization and request/response correlation. Generates unique `queryId` for each request, tracks pending requests, manages timeouts, and resolves Promises when responses arrive.

### `state.js`

Connection state machine that tracks the current connection status. Emits state change events and provides the `onConnectionChange` callback functionality.

**States:** `offline` → `connecting` → `connected` → `disconnected` → `walled`

### `reconnectBackoff.js`

Pure helpers implementing the same exponential cap (**30s**) and jitter (**20%**) as **`server/client/connection-reconnect.js`** so browser reconnect storms match Node timing.

### `network.js`

Detects network conditions to provide accurate connection state:
- **Offline** — Browser reports no network (`navigator.onLine`)
- **Walled garden** — Captive portal detected (WiFi login page)
- **Online** — Full internet connectivity confirmed

Also builds the WebSocket URL (**`getSocketUrl(resumeClientId)`**) including optional **`?resume=`** for Phase 1.

### `fileDownload.js`

Handles downloading binary data from the server. When a response contains `<!L>` (link) tags, fetches the binary data via HTTP GET with session cookies for authentication.

### `fileHandling.js`

Coordinates file uploads and downloads by detecting special tags in messages:
- `<!B>` / `<!A>` — Binary data that needs to be uploaded
- `<!L>` — Download links that need to be fetched

### `fileUtils.js`

Shared utilities for file transfer operations including content type detection, hash generation, and ArrayBuffer/Buffer conversions.

### `messageHandler.js`

Handles incoming message processing and dispatch. Processes binary data hydration (fetching linked resources) and dispatches messages to registered handlers and subscription callbacks. Provides the `setOnReceiver` function for registering message handlers.

### `subscriptions.js`

Manages channel subscriptions for the chained subscription syntax. Tracks local callbacks per channel, sends subscribe/unsubscribe messages to server, dispatches incoming data to callbacks, and handles resubscription on reconnect.