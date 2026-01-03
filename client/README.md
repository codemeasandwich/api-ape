# 🦍 api-ape Client

WebSocket client library with auto-reconnection and proxy-based API calls.

## Files

| File | Description |
|------|-------------|
| `browser.js` | Browser entry point - exposes `window.ape` |
| `connectSocket.js` | WebSocket client with auto-reconnect, queuing, and JJS encoding |

## Usage

### Browser (via script tag)

```html
<script src="/api/ape.js"></script>
<script>
  // Call server functions
  ape.hello('World').then(result => console.log(result))
  
  // Listen for broadcasts
  ape.on('message', ({ data }) => console.log(data))
</script>
```

### ES Module Import

```bash
npm i api-ape
```

```js
import ape from 'api-ape'

// Configure
ape.configure({ port: 3000 })

// Connect and enable auto-reconnect
const { sender, setOnReciver } = ape()
ape.autoReconnect()

// Use sender as API
sender.users.list().then(users => ...)

// Listen for broadcasts
setOnReciver('newUser', ({ data }) => ...)
```

## Features

- **Proxy-based API** — `ape.path.method(data)` converts to WebSocket calls
- **Auto-reconnect** — Reconnects on disconnect with queued messages
- **Promise-based** — All calls return promises with matched responses via queryId
- **JJS encoding** — Supports Date, RegExp, Error, Set, Map, undefined over the wire
- **Request timeout** — Configurable timeout (default: 10s)

## Configuration

```js
ape.configure({
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
const result = await ape.files.download('image.png')
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
await ape.files.upload({
  name: file.name,
  data: arrayBuffer  // Sent via HTTP PUT
})
```

Binary transfers use `/api/ape/data/:hash` endpoints with session verification.

