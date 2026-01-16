# Client Module Files

This module provides the browser-side WebSocket client for api-ape. All code here must be **browser-safe** and work in both ESM bundlers (React, Vue) and direct `<script>` tag usage.

## Guidelines

- **No Node.js APIs** — Code runs in browsers; avoid `fs`, `path`, `Buffer`, etc.
- **JSS encoding** — Use `utils/jss` for serialization, not raw `JSON.stringify`
- **Isomorphic imports** — Entry points must work with both CommonJS and ESM
- **Test with multiple transports** — Changes should work over WebSocket AND HTTP fallback

## Directory Structure

```
client/
├── index.js              # Unified entry — auto-initializing client with call buffering
├── browser.js            # Browser entry point — exposes window.api
├── connectSocket.js      # WebSocket client with auto-reconnect and JSS encoding
├── connectSocket.test.js # WebSocket client test suite
├── connection/           # Connection management modules
└── transports/           # Transport layer implementations (HTTP streaming fallback)
```

## Files

### `index.js`

Unified entry point that auto-initializes the client and provides call buffering. This is what users import when they `import api from 'api-ape'`. Buffers API calls made before the connection is established.

### `browser.js`

Browser-specific entry point served at `/api/ape.js`. Exposes `window.api` globally and handles script-tag initialization. Sets up the WebSocket connection automatically on load.

### `connectSocket.js`

Core WebSocket client implementation with:
- Auto-reconnection with exponential backoff
- JSS encoding/decoding for extended types
- Event emission for messages and connection state
- Request/response correlation via queryId
- Pub/sub channel subscriptions via `api.send({ subscribe: '/channel' })`

### `connectSocket.test.js`

Test suite for the WebSocket client. Tests connection lifecycle, message handling, and reconnection behavior.

### `connection/`

Submodule handling connection state, proxy API generation, and file transfers. See [`connection/files.md`](./connection/files.md).

### `transports/`

HTTP streaming fallback transport for when WebSocket is blocked. See [`transports/files.md`](./transports/files.md).