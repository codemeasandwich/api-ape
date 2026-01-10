# Server Lib Module Files

This is the core implementation of api-ape's server functionality. It orchestrates everything needed to transform a standard HTTP server into a real-time WebSocket API server with automatic controller routing, client management, and message handling.

## Guidelines

- **Runtime abstraction** — All code must work across Node.js, Bun, and Deno; use `wsProvider.js` for detection
- **No external dependencies** — Use the built-in WebSocket polyfill (`ws/`) instead of external packages
- **Controller loading** — New controller loading logic should go in `loader.js`; maintain the file-path-to-endpoint mapping convention
- **Client tracking** — Use `broadcast.js` for client registration; don't maintain separate client lists
- **Binary transfers** — Coordinate with `fileTransfer.js` for all binary data; use the tag system consistently
- **HTTP fallback** — Changes to WebSocket handling should have corresponding long-polling support

## Directory Structure

```
lib/
├── main.js              # Server initialization entry point
├── loader.js            # Controller file auto-loader
├── broadcast.js         # Client tracking & broadcast utilities
├── bun.js               # Bun.serve() high-level integration
├── fileTransfer.js      # Binary file transfer manager
├── fileTransfer.test.js # File transfer test suite
├── httpUtils.js         # Shared HTTP utilities
├── longPolling.js       # HTTP streaming fallback coordinator
├── wiring.js            # WebSocket connection lifecycle handler
├── wsProvider.js        # Runtime detection & WebSocket provider selection
├── fileTransfer/        # File transfer sub-modules
├── longPolling/         # Long-polling sub-modules
├── runtimes/            # Runtime-specific server initialization
└── ws/                  # RFC 6455 WebSocket polyfill
```

## Files

### `main.js`

Main entry point for initializing api-ape on an HTTP server. Detects the runtime environment, creates core handlers, and delegates to the appropriate runtime-specific initializer.

### `loader.js`

Recursively loads controller files from a directory, mapping file paths to endpoint names:
- `api/users.js` → `controllers['users']`
- `api/users/profile.js` → `controllers['users/profile']`
- `api/users/index.js` → `controllers['users']`

### `broadcast.js`

Manages connected clients and provides messaging utilities:
- `broadcast(type, data)` — Send to all clients
- `broadcastOthers(type, data, excludeClientId)` — Send to all except one
- `clients` — Read-only Map of connected clients with `sendTo()` method

### `bun.js`

High-level Bun integration that returns `fetch` and `websocket` handlers ready for `Bun.serve()`. Handles WebSocket upgrades, client bundle serving, and all api-ape routes.

### `fileTransfer.js`

Manages binary file uploads and downloads:
- Registers pending uploads with timeout handling
- Validates upload authorization via client session
- Coordinates streaming file transfers between clients

### `httpUtils.js`

Shared HTTP utilities used across the server:
- `matchRoute(path, pattern)` — URL pattern matching with parameter extraction
- `sendJson(res, status, data)` — JSON response helper
- `getCookie(headers, name)` — Cookie extraction
- `isSecure(req)` / `isLocalhost(host)` — Security checks

### `longPolling.js`

Coordinates HTTP long-polling as a WebSocket fallback. Creates and manages the GET (streaming) and POST (messaging) handlers that share client state.

### `wiring.js`

Sets up WebSocket connection lifecycle:
- Generates unique client IDs
- Parses User-Agent for client info
- Registers clients in broadcast system
- Invokes `onConnect` callback with lifecycle hooks
- Routes messages to controllers via `socket/receive.js`

### `wsProvider.js`

Detects runtime environment and returns the appropriate WebSocket implementation:
1. Deno → Native `Deno.upgradeWebSocket()`
2. Bun → Native Bun WebSocket
3. Node.js 24+ → Native `node:ws` module
4. Fallback → Built-in RFC 6455 polyfill

### `fileTransfer/`

File transfer sub-modules for streaming transfers. See [`fileTransfer/files.md`](./fileTransfer/files.md).

### `longPolling/`

HTTP long-polling handlers for GET (streaming) and POST (messaging). See [`longPolling/files.md`](./longPolling/files.md).

### `runtimes/`

Runtime-specific server initialization for Node.js and Bun. See [`runtimes/files.md`](./runtimes/files.md).

### `ws/`

RFC 6455 WebSocket polyfill and runtime adapters. See [`ws/files.md`](./ws/files.md).