# 🦍 api-ape Client

WebSocket client library with auto-reconnection and proxy-based API calls.

## Files

| File | Description |
|------|-------------|
| `index.js` | **Unified entry** — auto-initializing client with call buffering |
| `browser.js` | Browser entry point — exposes `window.ape` |
| `connectSocket.js` | WebSocket client with auto-reconnect, queuing, and JJS encoding |

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
  console.log('Connection:', state) // 'disconnected' | 'connecting' | 'connected'
})
```

**No async setup needed!** The client auto-initializes and buffers calls until connected.

## Features

- **Proxy-based API** — `ape.path.method(data)` converts to WebSocket calls
- **Auto-reconnect** — Reconnects on disconnect with queued messages
- **Promise-based** — All calls return promises with matched responses via queryId
- **JJS encoding** — Supports Date, RegExp, Error, Set, Map, undefined over the wire
- **Request timeout** — Configurable timeout (default: 10s)

## Configuration

```js
api.configure({
  port: 3000,    // WebSocket port
  host: 'api.example.com'  // WebSocket host
})
```

Default port detection:
- Local (`localhost`, `127.0.0.1`): `9010`
- Remote: Uses current page port or `443`/`80`

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

## Security

### CSRF Protection

api-ape includes built-in **Cross-Site Request Forgery (CSRF)** protection:

- **Origin Validation** — WebSocket connections validate Origin header against Host
- **Automatic Rejection** — Mismatched origins are rejected immediately
- **Session Verification** — Binary transfers verify session cookies

No configuration needed — protection is enabled by default.
