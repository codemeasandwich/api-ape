# Server Client Module Files

This module enables api-ape servers to act as WebSocket clients, connecting outbound to other api-ape servers or WebSocket endpoints. Essential for server-to-server communication in distributed architectures.

## Guidelines

- **Mirror browser client API** — The proxy-based API (`api.users.list()`) must behave identically to the browser client
- **JSS encoding** — Use `utils/jss` for message serialization to preserve Date, Set, Map, etc.
- **Auto-reconnection** — Always implement exponential backoff on connection failures
- **Message queuing** — Buffer messages during disconnection; deliver when reconnected
- **QueryId correlation** — All requests must track `queryId` for proper response matching

## Directory Structure

```
client/
├── index.js                 # Main entry point (proxy-based API client)
├── connection.js            # Connection lifecycle (connect, close, send, error handling)
└── connection-receivers.js  # Subscription registry (receivers, on, onConnectionChange)
```

## Files

### `index.js`

Main entry point for the server-side WebSocket client. Provides the proxy-based API that mirrors the browser client:

- **Proxy handler** — Intercepts property access to build API paths dynamically (`api.users.list()`)
- **Reserved methods** — Exposes `connect`, `close`, `on`, `onConnectionChange`, and `transport`
- **Module exports** — Exports the proxy client, individual methods, and `ConnectionState` enum

### `connection.js`

Manages outbound WebSocket connections from the server:

- **Connection lifecycle** — Connect, disconnect, and reconnect handling
- **Auto-reconnection** — Automatic reconnection with 1-second delay
- **Message queuing** — Queues messages during disconnection periods
- **Fast-fail on disconnect** — Pending RPC callbacks are rejected immediately when the socket closes, with diagnostic error messages including the server URL, pending request count, and actionable fix steps
- **Diagnostic error logging** — WebSocket errors log the server URL, pending request count, and numbered fix steps (health check commands, log inspection, firewall diagnosis, timeout configuration)
- **JSS encoding/decoding** — Full support for extended types (Date, Set, Map, etc.)
- **Request/response correlation** — Tracks pending requests via `queryId`
- **Delegates subscriptions** — Imports receiver/subscription functions from `connection-receivers.js` via late-binding

### `connection-receivers.js`

Message receiver and subscription registry, extracted from `connection.js` to keep both modules under the 260-SLOC limit:

- **Receiver management** — Register, remove, buffer, flush, and dispatch typed/untyped message receivers
- **Public subscription API** — `on()`, `onConnectionChange()`, `isReady()`, `getWs()` functions
- **Late-binding** — Uses `bindConnection()` to inject live connection state getters from `connection.js`, avoiding circular dependency
- **Connection state tracking** — Owns `connectionState` and `connectionChangeListeners`, deduplicates state notifications