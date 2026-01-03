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
