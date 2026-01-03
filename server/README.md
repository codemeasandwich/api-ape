# 🦍 api-ape Server

Express.js integration for WebSocket-based Remote Procedure Events (RPE).

## Directory Structure

```
server/
├── index.js          # Entry point (exports lib/main)
├── lib/
│   ├── main.js       # Express integration & setup
│   ├── loader.js     # Auto-loads controller files from folder
│   ├── broadcast.js  # Client tracking & broadcast utilities
│   └── wiring.js     # WebSocket handler setup
├── socket/
│   ├── receive.js    # Incoming message handler
│   └── send.js       # Outgoing message handler
├── security/
│   └── reply.js      # Duplicate request protection
└── utils/
    └── ...           # Server utilities
```

## Usage

```bash
npm i api-ape
```

```js
const express = require('express')
const ape = require('api-ape')

const app = express()

ape(app, {
  where: 'api',        // Controller directory
  onConnent: (socket, req, send) => ({
    embed: { userId: req.session?.userId },
    onDisconnent: () => console.log('Client left')
  })
})

app.listen(3000)
```

## API

### `ape(app, options)`

| Option | Type | Description |
|--------|------|-------------|
| `where` | `string` | Directory containing controller files |
| `onConnent` | `function` | Connection lifecycle hook |

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
├── users/
│   ├── list.js   → ape.users.list(data)
│   └── create.js → ape.users.create(data)
```
