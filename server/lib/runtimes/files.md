# Runtimes Module Files

This module provides runtime-specific server initialization for api-ape. Different JavaScript runtimes (Node.js, Bun, Deno) have fundamentally different server architectures, and this module abstracts those differences to provide a unified api-ape experience across all platforms.

## Guidelines

- **Preserve existing handlers** — When injecting into existing servers, never remove or break existing route handlers
- **Runtime detection** — Use `wsProvider.js` for runtime detection; don't duplicate detection logic
- **Route consistency** — All runtimes must handle the same set of api-ape routes (see table below)
- **WebSocket adapters** — Use runtime-specific adapters from `ws/adapters/` for WebSocket normalization
- **Hot reload support** — Bun integration uses `server.reload()` for hot injection; maintain this capability
- **Express compatibility** — Node.js integration must work with both raw HTTP servers and Express apps

## Directory Structure

```
runtimes/
├── bun.js                 # Bun runtime integration
├── bunRequest.js          # Node-shaped request + pre-upgrade Origin check for Bun
├── bunWebSocketConfig.js  # Validated pass-through of Bun websocket options
└── node.js                # Node.js/Express integration
```

## Files

### `node.js`

Node.js and Express integration:

- Adds WebSocket upgrade listener to existing HTTP server
- Injects request handler that intercepts api-ape routes
- Preserves all existing request listeners (Express routes still work)
- Handles file uploads/downloads via standard Node.js HTTP APIs
- Creates WebSocket server in `noServer` mode for manual upgrade handling
- Refuses a disallowed `Origin` with an HTTP 403 before the handshake (`core.originPolicy`)

### `bun.js`

Bun runtime integration:

- **`isBunServer(server)`** — Detect if server is a Bun server instance
- **`initBunServer(options, core)`** — Create fresh `fetch` and `websocket` handlers for `Bun.serve()`
- **`initBunServerWithReload(server, options, core)`** — Inject api-ape into existing Bun server via hot reload
- Uses Bun's native WebSocket through `BunWebSocket` adapter
- Delegates the upgrade to `bunRequest.js` (Origin check first, Node-shaped `req`) and spreads `websocketOptions` into the Bun `websocket` object

### `bunRequest.js`

Shared by `api-ape/bun` (`server/lib/bun.js`) and `bun.js` here, so the two Bun entry points cannot drift:

- **`toNodeRequest(req, server)`** — turn a Fetch `Request` into the Node shape the rest of api-ape reads (`headers` plain object keyed by lower-case name with non-enumerable `get`/`has`, `url` as path + query, `method`, `socket.remoteAddress`, `rawRequest`)
- **`upgradeWebSocket(req, server, { originPolicy, onError })`** — run the Origin policy (default `exact`) before `server.upgrade()`; returns `null` (not an upgrade), `undefined` (upgraded), or a 403/500 `Response`

### `bunWebSocketConfig.js`

`bunWebSocketConfig(options)` forwards the documented `Bun.serve` websocket tuning options (`idleTimeout`, `sendPings`, ...) and throws on any other key. Its header documents what api-ape does and does not do for keepalive under Bun.

## Routes Handled

Both runtime modules must handle these api-ape routes:

| Path | Method | Description |
|------|--------|-------------|
| `/{where}/ape` | WS | WebSocket upgrade endpoint |
| `/{where}/ape.js` | GET | Client JavaScript bundle |
| `/{where}/ape.js.map` | GET | Source map for debugging |
| `/{where}/ape/ping` | GET | Health check endpoint |
| `/{where}/ape/poll` | GET | Long-polling streaming endpoint |
| `/{where}/ape/poll` | POST | Long-polling message endpoint |
| `/{where}/ape/data/:hash` | GET | Binary file download |
| `/{where}/ape/data/:qid/:hash` | PUT | Binary file upload |