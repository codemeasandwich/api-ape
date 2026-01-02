# 🦍 api-ape

**Remote Procedure Events (RPE)** — A lightweight WebSocket framework for real-time APIs.

Call server functions from the browser like local methods. Get real-time broadcasts with zero setup.

```js
// Client: call server function, get result
const pets = await ape.pets.list()

// Client: listen for broadcasts
ape.on('newPet', ({ data }) => console.log('New pet:', data))
```

```js
// Server: define function, broadcast to others
module.exports = function createPet(data) {
  this.broadcastOthers('newPet', data)
  return savePet(data)
}
```

---

## Features

- **🔌 Auto-wiring** — Drop JS files in a folder, they become API endpoints
- **📡 Real-time** — Built-in broadcast to all or other clients
- **🔄 Reconnection** — Client auto-reconnects on disconnect
- **📦 JJS Encoding** — Supports Date, RegExp, Error, Set, Map, undefined over the wire
- **🎯 Simple API** — Promise-based calls with chainable paths

---

## Installation

```bash
npm install api-ape
```

---

## Quick Start

### Server (Express.js)

```js
const express = require('express')
const ape = require('api-ape')

const app = express()

// Wire up api-ape - loads controllers from ./api folder
ape(app, { where: 'api' })

app.listen(3000)
```

### Controllers

Create files in your `api/` folder. Each export becomes an endpoint:

```js
// api/hello.js
module.exports = function(name) {
  return `Hello, ${name}!`
}
```

```js
// api/message.js
module.exports = function(data) {
  // Broadcast to all OTHER connected clients
  this.broadcastOthers('message', data)
  return data
}
```

### Client (Browser)

Include the bundled client:

```html
<script src="/api/ape.js"></script>
<script>
  // Call server functions
  ape.hello('World').then(result => console.log(result)) // "Hello, World!"
  
  // Listen for broadcasts
  ape.on('message', ({ data }) => {
    console.log('New message:', data)
  })
</script>
```

---

## API Reference

### Server

#### `ape(app, options)`

Initialize api-ape on an Express app.

| Option | Type | Description |
|--------|------|-------------|
| `where` | `string` | Directory containing controller files |
| `onConnent` | `function` | Connection lifecycle hook (see below) |

#### Controller Context (`this`)

Inside controller functions, `this` provides:

| Property | Description |
|----------|-------------|
| `this.broadcast(type, data)` | Send to ALL connected clients |
| `this.broadcastOthers(type, data)` | Send to all EXCEPT the caller |
| `this.online()` | Get count of connected clients |
| `this.getClients()` | Get array of connected hostIds |
| `this.hostId` | Unique ID of the calling client |
| `this.req` | Original HTTP request |
| `this.socket` | WebSocket instance |
| `this.agent` | Parsed user-agent (browser, OS, device) |

#### Connection Lifecycle

```js
ape(app, {
  where: 'api',
  onConnent(socket, req, send) {
    return {
      // Embed values into `this` for all controllers
      embed: {
        userId: req.session?.userId,
        clientId: send + '' // hostId as string
      },
      
      // Before/after hooks
      onReceive: (queryId, data, type) => {
        console.log(`→ ${type}`)
        return (err, result) => console.log(`← ${type}`, err || result)
      },
      
      onSend: (data, type) => {
        console.log(`⇐ ${type}`)
        return (err, result) => console.log(`Sent: ${type}`)
      },
      
      onError: (errStr) => console.error(errStr),
      onDisconnent: () => console.log('Client left')
    }
  }
})
```

### Client

#### `ape.<path>.<method>(data)`

Call a server function. Returns a Promise.

```js
// Calls api/users/list.js
ape.users.list().then(users => ...)

// Calls api/users/create.js with data
ape.users.create({ name: 'Alice' }).then(user => ...)

// Nested paths work too
ape.admin.users.delete(userId).then(() => ...)
```

#### `ape.on(type, handler)`

Listen for server broadcasts.

```js
ape.on('notification', ({ data, err, type }) => {
  console.log('Received:', data)
})
```

---

## JJS Encoding

api-ape uses **JJS (JSON SuperSet)** encoding, which extends JSON to support:

| Type | Supported |
|------|-----------|
| `Date` | ✅ Preserved as Date objects |
| `RegExp` | ✅ Preserved as RegExp |
| `Error` | ✅ Preserved with name, message, stack |
| `undefined` | ✅ Preserved (not converted to null) |
| `Set` | ✅ Preserved as Set |
| `Map` | ✅ Preserved as Map |
| Circular refs | ✅ Handled via pointers |

This is automatic — send a Date, receive a Date.

---

## Examples

See the [`example/`](./example) folder:

- **ExpressJs/** — Simple chat app with broadcast
- **NextJs/** — Integration with Next.js

Run the Express example:

```bash
cd example/ExpressJs
npm install
npm start
```

---

## Project Structure

```
api-ape/
├── client/
│   ├── browser.js       # Browser entry point (window.ape)
│   └── connectSocket.js # WebSocket client with auto-reconnect
├── server/
│   ├── lib/
│   │   ├── main.js      # Express integration
│   │   ├── loader.js    # Auto-loads controller files
│   │   ├── broadcast.js # Client tracking & broadcast
│   │   └── wiring.js    # WebSocket handler setup
│   ├── socket/
│   │   ├── receive.js   # Incoming message handler
│   │   └── send.js      # Outgoing message handler
│   └── security/
│       └── reply.js     # Duplicate request protection
├── utils/
│   ├── jjs.js           # JSON SuperSet encoder/decoder
│   └── messageHash.js   # Request deduplication
└── example/
    ├── ExpressJs/       # Chat app example
    └── NextJs/          # Next.js integration
```

---

## License

ISC © [Brian Shannon](https://github.com/codemeasandwich)