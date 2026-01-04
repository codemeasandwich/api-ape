# 🦍 api-ape Server

Express.js integration for WebSocket-based Remote Procedure Events (RPE).

## Directory Structure

```
server/
├── index.js          # Entry point (exports lib/main)
├── lib/
│   ├── main.js       # HTTP server integration & setup
│   ├── loader.js     # Auto-loads controller files from folder
│   ├── broadcast.js  # Client tracking & broadcast utilities
│   ├── fileTransfer.js # Binary file transfer manager
│   ├── longPolling.js  # HTTP streaming fallback handler
│   └── wiring.js     # WebSocket handler setup
├── socket/
│   ├── receive.js    # Incoming message handler
│   └── send.js       # Outgoing message handler
├── security/
│   ├── origin.js     # Origin verification (works with Express & raw Node.js)
│   └── reply.js      # Duplicate request protection
└── utils/
    └── ...           # Server utilities
```

## Usage

```bash
npm i api-ape
```

```js
const { createServer } = require('http')
const ape = require('api-ape')

const server = createServer()

ape(server, {
  where: 'api',        // Controller directory
  onConnent: (socket, req, send) => ({
    embed: { userId: req.session?.userId },
    onDisconnent: () => console.log('Client left')
  })
})

server.listen(3000)
```

## API

### `ape(server, options)`

| Option | Type | Description |
|--------|------|-------------|
| `where` | `string` | Directory containing controller files |
| `onConnent` | `function` | Connection lifecycle hook |
| `fileTransferOptions` | `object` | Binary transfer settings (see below) |

### File Transfer Options

```js
ape(app, {
  where: 'api',
  fileTransferOptions: {
    startTimeout: 60000,    // Time to wait for transfer start (ms)
    completeTimeout: 60000  // Time after start before cleanup (ms)
  }
})
```

### Controller Context (`this`)

| Property | Description |
|----------|-------------|
| `this.broadcast(type, data)` | Send to ALL connected clients |
| `this.broadcastOthers(type, data)` | Send to all EXCEPT the caller |
| `this.online()` | Get count of connected clients |
| `this.getClients()` | Get array of connected hostIds |
| `this.hostId` | Unique ID of the calling client |
| `this.req` | Original HTTP request |
| `this.socket` | WebSocket instance |
| `this.agent` | Parsed user-agent |

### Connection Lifecycle Hooks

```js
onConnent(socket, req, send) {
  return {
    embed: { ... },          // Values available as this.* in controllers
    onReceive: (queryId, data, type) => afterFn,
    onSend: (data, type) => afterFn,
    onError: (errStr) => { ... },
    onDisconnent: () => { ... }
  }
}
```

## Auto-Routing

Drop JS files in your `where` directory:

```
api/
├── hello.js      → ape.hello(data)
├── users.js      → ape.users(data)
├── posts/
│   ├── index.js  → ape.posts(data)     # index.js maps to parent folder
│   ├── list.js   → ape.posts.list(data)
│   └── create.js → ape.posts.create(data)
```

**Note**: Both `api/users.js` and `api/users/index.js` map to the same endpoint `ape.users(data)`. Use `index.js` when you want to group related files in a folder.

**⚠️ Duplicate Detection**: If both files exist, api-ape will throw an error on startup:
```
🦍 Duplicate endpoint detected: "users"
   - /users/index.js
   - /users.js
   Remove one of these files to fix this conflict.
```

## File Transfers

Controllers can return `Buffer` data directly. The framework handles conversion:

```js
// api/files/download.js
const fs = require('fs')

module.exports = function(filename) {
  return {
    name: filename,
    data: fs.readFileSync(`./uploads/${filename}`)
  }
}
```

For uploads, the controller receives `Buffer` data:

```js
// api/files/upload.js
module.exports = function({ name, data }) {
  // data is a Buffer
  fs.writeFileSync(`./uploads/${name}`, data)
  return { success: true }
}
```

Binary data is transferred via `/api/ape/data/:hash` with session verification and HTTPS enforcement (localhost exempt).

---

## HTTP Streaming Endpoints

api-ape automatically provides HTTP streaming endpoints as a fallback when WebSockets are blocked:

### GET `/api/ape/poll`

Long-lived HTTP streaming connection for receiving server messages.

- **Session**: Cookie-based (`apeHostId`)
- **Response**: Streaming JSON messages
- **Heartbeat**: Every 20 seconds
- **Auto-reconnect**: Client reconnects after 25 seconds

### POST `/api/ape/poll`

Send messages to server when using HTTP streaming transport.

- **Session**: Cookie-based (`apeHostId`)
- **Body**: JJS-encoded message
- **Response**: JJS-encoded result

### How It Works

1. Client attempts WebSocket connection first
2. On failure (firewall/proxy blocking), falls back to HTTP streaming
3. Background WebSocket retry every 30 seconds
4. Automatically upgrades back to WebSocket when available

The fallback is **completely transparent** to your controllers - they work identically with both transports.
