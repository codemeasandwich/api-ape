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
├── index.js                   # Main entry point (proxy-based API client)
├── connection.js              # Connection lifecycle + queue/send wiring
├── connection-queue-send.js   # Queue-or-send RPC helper extracted for line-count limits
├── connection-ws-url.js       # WS URL + Phase 1 resume query assembly
├── connection-send.js         # Factories for correlated RPC promises + timeouts
├── connection-reconnect.js    # Backoff timers + suppressed error logging helpers
└── connection-receivers.js    # Subscription registry (receivers, on, onConnectionChange)
```

## Files

### `index.js`

Main entry point for the server-side WebSocket client. Provides the proxy-based API that mirrors the browser client:

- **Proxy handler** — Intercepts property access to build API paths dynamically (`api.users.list()`)
- **Reserved methods** — Exposes `connect`, `close`, `on`, `onConnectionChange`, and `transport`
- **Module exports** — Exports the proxy client, individual methods, and `ConnectionState` enum

### `connection.js`

Manages outbound WebSocket connections from the server:

- **Logical reconnect (Phase 1)** — Parses **`__connected__`** for **`clientId`** / **`sessionId`**; reconnect URLs carry **`resume`** query + **`Cookie: sessionId=…`**; **`connect(host, port)`** clears logical ids when the target changes ([Server README](../README.md#websocket-logical-reconnect-phase-1))
- **Auto-reconnection** — Exponential backoff with jitter capped at ~30 s plus error log throttling
- **Configurable logging** — `connect(_, _, { logging })` and `configureApeLogging()`
- **Message queuing** — Queues messages during disconnection periods
- **Fast-fail on disconnect** — Pending RPC callbacks are rejected immediately when the socket closes
- **JSS encoding/decoding** — Full support for extended types (Date, Set, Map, etc.)
- **Delegates heavy logic** — Receivers in `connection-receivers.js`, RPC promise factory in `connection-send.js`, reconnect helper in `connection-reconnect.js`, resume URL builder in `connection-ws-url.js`, buffered RPC helper in `connection-queue-send.js`

### `connection-queue-send.js`

Queues outbound RPC while disconnected (until `connectTimeout`) or forwards to `send` when the socket is already open.

### `connection-ws-url.js`

Pure helper that appends the Phase 1 `resume=` query when `apeLogicalClientId` is known.

### `connection-send.js`

Produces the correlated `send(type, payload)` RPC helper wired to JSS `queryId`, keepalive timer resets, and WebSocket payloads.

### `connection-reconnect.js`

Implements backoff scheduling (`scheduleReconnect`, `cancelReconnect`, `resetBackoff`) and suppressed WebSocket error log accounting so outages do not flood consoles.

### `connection-receivers.js`

Message receiver and subscription registry, extracted from `connection.js` to keep both modules under the 260-SLOC limit:

- **Receiver management** — Register, remove, buffer, flush, and dispatch typed/untyped message receivers
- **Public subscription API** — `on()`, `onConnectionChange()`, `isReady()`, `getWs()` functions
- **Late-binding** — Uses `bindConnection()` to inject live connection state getters from `connection.js`, avoiding circular dependency
- **Connection state tracking** — Owns `connectionState` and `connectionChangeListeners`, deduplicates state notifications