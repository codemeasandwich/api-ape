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
├── bun.js    # Bun runtime integration
└── node.js   # Node.js/Express integration
```

## Files

### `node.js`

Node.js and Express integration:

- Adds WebSocket upgrade listener to existing HTTP server
- Injects request handler that intercepts api-ape routes
- Preserves all existing request listeners (Express routes still work)
- Handles file uploads/downloads via standard Node.js HTTP APIs
- Creates WebSocket server in `noServer` mode for manual upgrade handling

### `bun.js`

Bun runtime integration:

- **`isBunServer(server)`** — Detect if server is a Bun server instance
- **`initBunServer(options, core)`** — Create fresh `fetch` and `websocket` handlers for `Bun.serve()`
- **`initBunServerWithReload(server, options, core)`** — Inject api-ape into existing Bun server via hot reload
- Uses Bun's native WebSocket through `BunWebSocket` adapter

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