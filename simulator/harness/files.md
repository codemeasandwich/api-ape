# Test Harness Module Files

This module provides the core infrastructure for end-to-end testing of api-ape. It orchestrates server instances, simulated browser clients, and fake database adapters to enable comprehensive testing without external dependencies.

## Guidelines

- **Public API only** — Never import api-ape internals; use only the public `ape()` and exported functions
- **Short timeouts** — Use 500ms for connections, 1000ms for requests since everything runs locally
- **Cleanup always** — Always call `harness.cleanup()` in `afterEach` to avoid port conflicts
- **QueryId matching** — Client must generate queryId using the same hash algorithm as the server
- **Singleton reset** — Call `_resetForTesting()` before creating new servers to reset api-ape's singleton state

## Directory Structure

```
harness/
├── index.js              # Main entry point, Harness class, orchestration helpers
├── client-manager.js     # WebSocket client lifecycle management
├── server-manager.js     # api-ape server lifecycle management
├── fake-browser.js       # Browser environment simulation for Node.js
└── fake-db.js            # In-memory database adapter for cluster testing
```

## Files

### `index.js`

Main entry point that ties together all harness components. Exports:

- `Harness` — Main orchestrator class with `createPair()`, `createGroup()`, `createCluster()`, `cleanup()`
- `quickSetup()` — One-liner to create harness + server + client
- Re-exports from all submodules for convenience

### `client-manager.js`

Manages simulated browser clients for testing:

- `ClientManager` — Creates and tracks multiple client instances
- `ClientInstance` — Wrapper around WebSocket connection with api-ape protocol support
- Implements JSS encoding/decoding, queryId correlation, broadcast message buffering
- Supports both WebSocket and HTTP polling transports

### `server-manager.js`

Manages api-ape server instances:

- `ServerManager` — Creates servers with automatic port allocation
- `ServerInstance` — Wrapper around HTTP server with api-ape initialized
- Handles controller path resolution relative to simulator directory
- Provides `broadcast()`, `clients`, and `clientCount` accessors

### `fake-browser.js`

Simulates browser environment for api-ape client code:

- `FakeBrowser` — Main class that installs/uninstalls browser globals
- `FakeWindow` — Provides window object with WebSocket, fetch, localStorage
- `FakeDocument` — Minimal DOM implementation
- `FakeNavigator` — Simulates online/offline state

### `fake-db.js`

In-memory implementation of api-ape's adapter interface for cluster testing:

- `FakeDatabase` — Shared storage simulating Redis/MongoDB/PostgreSQL
- `createFakeDbAdapter()` — Creates adapter instance for a specific server
- Implements `lookup` (client-to-server mapping) and `channels` (pub/sub) interfaces
- Enables testing Forest cluster features without real databases
