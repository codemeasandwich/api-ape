# Server Module Files

This module provides the backend infrastructure for api-ape's WebSocket-based Remote Procedure Events (RPE) system. It transforms standard HTTP servers into real-time API servers with automatic controller routing.

## Guidelines

- **Multi-runtime support** — Code must work on Node.js, Bun, and Deno; use runtime detection via `lib/wsProvider.js`
- **Zero dependencies** — Avoid external packages; use built-in WebSocket polyfill when native unavailable
- **JSS encoding** — Always use `utils/jss` for message serialization to preserve extended types
- **Controller context** — Controllers receive `this` context with `clientId`, `broadcast`, `sendTo`, and embedded data
- **Binary transfers** — Use the tag system (`<!B>`, `<!A>`, `<!L>`, `<!F>`) for file handling

## Directory Structure

```
server/
├── index.js      # Entry point (exports lib/main)
├── client.js     # Server-to-server WebSocket client
├── client/       # Server-side client connection management
├── lib/          # Core server implementation
├── adapters/     # 🌲 Forest distributed mesh adapters
├── socket/       # WebSocket message handlers
├── security/     # Origin validation & CSRF protection
└── utils/        # Server utilities
```

## Files

### `index.js`

Main entry point that re-exports the `ape` initializer from `lib/main.js`. This is what users get when they `require('api-ape')` or `import { ape } from 'api-ape'`.

### `client.js`

Server-to-server WebSocket client that allows api-ape servers to connect outbound to other api-ape servers or WebSocket endpoints. Uses the same proxy-based API as the browser client.

### `client/`

Server-side client connection management for outbound connections. See [`client/files.md`](./client/files.md).

### `lib/`

Core server implementation including initialization, controller loading, broadcasting, and WebSocket handling. See [`lib/files.md`](./lib/files.md).

### `adapters/`

Database adapters for the Forest distributed mesh system (Redis, MongoDB, PostgreSQL, Supabase, Firebase). See [`adapters/files.md`](./adapters/files.md).

### `socket/`

WebSocket message handlers for connection validation, incoming message processing, and response serialization. See [`socket/files.md`](./socket/files.md).

### `security/`

Origin validation and CSRF protection for WebSocket connections. See [`security/files.md`](./security/files.md).

### `utils/`

Server utilities including controller loading, ID generation, and User-Agent parsing. See [`utils/files.md`](./utils/files.md).