# WebSocket Adapters Module Files

This module provides runtime-specific WebSocket implementations that wrap native WebSocket APIs to match the `ws` library interface. Each JavaScript runtime (Bun, Deno) has its own unique WebSocket API, and these adapters normalize those differences so api-ape can use a consistent interface across all platforms.

## Guidelines

- **ws library API compatibility** — All adapters must match the `ws.WebSocketServer` interface exactly
- **EventEmitter pattern** — Wrap native event patterns (property-based, callback-based) in Node.js EventEmitter
- **Client tracking** — Maintain a `clients` Set matching `ws.WebSocketServer` behavior
- **Buffer consistency** — Always return message data as Buffer, regardless of runtime native format
- **No cross-runtime code** — Each adapter file is runtime-specific; don't import Bun APIs in Deno adapter
- **Test on actual runtimes** — Changes must be tested on the actual runtime, not just Node.js

## Directory Structure

```
adapters/
├── bun.js    # Bun native WebSocket adapter
└── deno.js   # Deno native WebSocket adapter
```

## Files

### `bun.js`

Adapters for Bun's native WebSocket:

- **`BunWebSocket`** — Wraps Bun's WebSocket in an EventEmitter interface with `send()`, `close()`, and `readyState`
- **`BunWebSocketServer`** — Provides `ws.WebSocketServer` compatible API with `clients` Set and `handleUpgrade()`
- **`websocketHandlers`** — Object containing `open`, `message`, `close`, `error` handlers for `Bun.serve()`

Bun requires WebSocket handlers to be passed to `Bun.serve()` rather than attached to individual socket instances.

### `deno.js`

Adapters for Deno's native WebSocket:

- **`DenoWebSocket`** — Wraps Deno's property-based events (`onmessage`, `onclose`) in EventEmitter interface
- **`DenoWebSocketServer`** — Provides `ws.WebSocketServer` compatible API using `Deno.upgradeWebSocket()`
- Returns `{ response }` from `handleUpgrade()` for Deno's request handler pattern

Deno uses `Deno.upgradeWebSocket()` which returns both a socket and a Response that must be returned from the request handler.