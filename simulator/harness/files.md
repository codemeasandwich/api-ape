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
├── client-manager.js     # ClientManager factory (tracks simulated clients)
├── client-instance.js    # ClientInstance class wiring + constructor
├── client-instance-connect-proto.js    # Transport URLs + WS/polling connect methods
├── client-instance-messaging-proto.js  # Incoming message dispatch + raw send
├── client-instance-rpc-proto.js        # call / binary helpers / uploads
├── client-instance-lifecycle-proto.js # on / waitFor / disconnect helpers
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

Tracks simulated browser clients (`ClientManager`) and delegates per-connection behavior to `client-instance.js`.

### `client-instance.js`

Defines `ClientInstance` (constructor + prototype merges from `client-instance-*-proto.js` modules). Keeps each file under repository line-count limits.

### `client-instance-connect-proto.js`

URL helpers and WebSocket / long-polling transport setup for harness clients.

### `client-instance-messaging-proto.js`

Parses inbound JSS frames, routes RPC replies, buffers broadcasts.

### `client-instance-rpc-proto.js`

`call`, binary upload helpers, HTTP PUT side-channel for `<!B>` / `<!A>` flows.

### `client-instance-lifecycle-proto.js`

Event handlers, `waitFor`, disconnect cleanup.

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
