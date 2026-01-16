# WebSocket Adapters Module

## Overview

The adapters module provides runtime-specific WebSocket implementations that wrap native WebSocket APIs to match the `ws` library interface. Each JavaScript runtime (Bun, Deno) has its own unique WebSocket API, and these adapters normalize those differences so api-ape can use a consistent interface across all platforms.

**Key capabilities:**

- **API normalization** — Convert runtime-specific WebSocket APIs to `ws` library compatible interface
- **Event bridging** — Translate native event patterns (property-based, callback-based) to EventEmitter events
- **Client management** — Track connected clients with a `clients` Set matching `ws.WebSocketServer`
- **Buffer handling** — Ensure all message data is returned as Buffer for consistency

Without these adapters, api-ape would need runtime-specific code throughout the codebase. Instead, the adapters provide a single interface that works identically whether running on Bun, Deno, or Node.js.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## API Compatibility

Both adapters provide the same interface as `ws.WebSocketServer`:

```js
// Works identically with any adapter
wss.on('connection', (ws, req) => {
  ws.on('message', (data) => console.log(data.toString()))
  ws.on('close', () => console.log('disconnected'))
  ws.send('Hello!')
  ws.close(1000, 'Goodbye')
})

// Access connected clients
for (const client of wss.clients) {
  if (client.readyState === client.OPEN) {
    client.send('Broadcast message')
  }
}
```

## When Are Adapters Used?

The `wsProvider.js` module automatically selects the appropriate adapter:

| Runtime | Adapter Used |
|---------|--------------|
| Bun | `BunWebSocketServer` from `bun.js` |
| Deno | `DenoWebSocketServer` from `deno.js` |
| Node.js 24+ | Native `node:ws` module (no adapter) |
| Node.js < 24 | Polyfill from `../server.js` (no adapter) |

## See Also

- [`../README.md`](../README.md) — WebSocket polyfill documentation
- [`../../wsProvider.js`](../../wsProvider.js) — Runtime detection and provider selection
- [`../../runtimes/`](../../runtimes/) — Runtime-specific server initialization