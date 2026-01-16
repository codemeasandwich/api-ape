# 🦍 api-ape Client

## Overview

The client module provides the browser-side WebSocket client for api-ape. It enables seamless communication with api-ape servers through a proxy-based API that converts method calls like `api.users.list()` into WebSocket messages.

**Key capabilities:**

- **Proxy-based API** — Call server endpoints like local methods (`api.path.method(data)`)
- **Auto-reconnection** — Automatically reconnects with exponential backoff on disconnection
- **Call buffering** — Queues calls made before connection is established
- **JSS encoding** — Supports Date, RegExp, Error, Set, Map, and undefined over the wire
- **HTTP fallback** — Falls back to long-polling when WebSocket is blocked
- **Binary transfers** — Transparent file upload/download handling
- **Connection state** — Track connection status (offline, connecting, connected, disconnected)
- **Pub/sub subscriptions** — Subscribe to channels and receive targeted updates

The client works in both browser environments (via `<script>` tag) and bundled applications (React, Vue, etc.).

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

### Browser (via script tag)

```html
<script src="/api/ape.js"></script>
<script>
  // Call server functions
  api.hello('World').then(result => console.log(result))
  
  // Listen for broadcasts
  api.on('message', ({ data }) => console.log(data))
</script>
```

### ES Module Import (React, Vue, etc.)

```bash
npm i api-ape
```

```js
import api from 'api-ape'

// Just use it! Calls are buffered until connected.
api.users.list().then(users => console.log(users))

// Listen for broadcasts
api.on('message', ({ data }) => console.log(data))

// Track connection state
api.onConnectionChange((state) => {
  console.log('Connection:', state)
  // 'offline' | 'walled' | 'disconnected' | 'connecting' | 'connected'
})
```

**Connection States:**
- `offline` — Browser reports no network
- `walled` — Captive portal detected (WiFi without real internet)
- `disconnected` — Had connection, lost it
- `connecting` — Actively connecting
- `connected` — Ready to use
- `closing` — Connection is closing

**No async setup needed!** The client auto-initializes and buffers calls until connected.

## Features

- **Proxy-based API** — `ape.path.method(data)` converts to WebSocket calls
- **Auto-reconnect** — Reconnects on disconnect with queued messages
- **Promise-based** — All calls return promises with matched responses via queryId
- **JSS encoding** — Supports Date, RegExp, Error, Set, Map, undefined over the wire
- **Request timeout** — Configurable timeout (default: 10s)

## File Transfers

Binary data is automatically handled. The client fetches binary resources and uploads binary data transparently.

### Receiving Binary Data

```js
// Server returns Buffer, client receives ArrayBuffer
const result = await api.files.download('image.png')
console.log(result.data)  // ArrayBuffer

// Display as image
const blob = new Blob([result.data])
img.src = URL.createObjectURL(blob)
```

### Uploading Binary Data

```js
const file = input.files[0]
const arrayBuffer = await file.arrayBuffer()

// Binary data is uploaded automatically
await api.files.upload({
  name: file.name,
  data: arrayBuffer  // Sent via HTTP PUT
})
```

Binary transfers use `/api/ape/data/:hash` endpoints with session verification.

## Pub/Sub Subscriptions

Subscribe to channels to receive targeted updates from the server:

```js
// Subscribe to a channel
api.send({ subscribe: '/health' })
api.send({ subscribe: '/stock/AAPL' })

// Listen for published messages (same as broadcast)
api.on('/health', ({ data }) => {
  console.log('Health update:', data)
})

api.on('/stock/AAPL', ({ data }) => {
  console.log('AAPL:', data.price)
})

// Unsubscribe when done
api.send({ unsubscribe: '/health' })
```

**Behavior:**
- On subscribe, you receive the last published message immediately (if any)
- Messages arrive in the same format as broadcasts: `{ type: channel, data: payload }`
- Subscriptions are automatically cleaned up on disconnect

## Security

### CSRF Protection

api-ape includes built-in **Cross-Site Request Forgery (CSRF)** protection:

- **Origin Validation** — WebSocket connections validate Origin header against Host
- **Automatic Rejection** — Mismatched origins are rejected immediately
- **Session Verification** — Binary transfers verify session cookies

No configuration needed — protection is enabled by default.
