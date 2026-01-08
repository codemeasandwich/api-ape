# 🦍 api-ape

[![npm version](https://img.shields.io/npm/v/api-ape.svg)](https://www.npmjs.com/package/api-ape)
[![GitHub issues](https://img.shields.io/github/issues/codemeasandwich/api-ape)](https://github.com/codemeasandwich/api-ape/issues)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#zero-dependencies)
[![Dependabot](https://img.shields.io/dependabot/codemeasandwich/api-ape)](https://github.com/codemeasandwich/api-ape/security/dependabot)
[![CSRF protected](https://img.shields.io/badge/CSRF%20🚷-protected-green.svg)](#csrf-protection)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/api-ape)](https://bundlephobia.com/package/api-ape)
[![JJS Encoding](https://img.shields.io/badge/encoding-JJS-blue.svg)](#jjs-encoding)
[![license](https://img.shields.io/npm/l/api-ape.svg)](https://github.com/codemeasandwich/api-ape/blob/main/LICENSE)

**Remote Procedure Events (RPE)** — A lightweight WebSocket framework for building real-time APIs. Call server functions from the browser like local methods. Get real-time broadcasts with zero setup.

---

## Install

```bash
npm install api-ape
# or
pnpm add api-ape
# or
yarn add api-ape
```

**Requirements:** Node.js 14+ (for server), modern browsers (for client)

---

## Quick Start

### Server (Node.js)

```js
const { createServer } = require('http')
const api = require('api-ape')           // Client proxy (default export)
const { ape } = require('api-ape')       // Server initializer

const server = createServer()

// Wire up api-ape - loads controllers from ./api folder
ape(server, { where: 'api' })

server.listen(3000)
```

**With Express:**
```js
const express = require('express')
const { ape } = require('api-ape')

const app = express()
const server = app.listen(3000)  // Get the HTTP server

// Pass the HTTP server (not the Express app)
ape(server, { where: 'api' })
```

### Create a Controller

Drop a file in your `api/` folder — it automatically becomes an endpoint:

```js
// api/hello.js
module.exports = function(name) {
  return `Hello, ${name}!`
}
```

### Client (Browser)

Include the bundled client and start calling:

```html
<script src="/api/ape.js"></script>
<script>
  // Call server functions like local methods
  const result = await api.hello('World')
  console.log(result) // "Hello, World!"
  
  // Listen for broadcasts
  api.on('message', ({ data }) => {
    console.log('New message:', data)
  })
</script>
```

### Client (React, Vue, etc.)

With bundlers, use the unified import — no async setup needed:

```js
import api from 'api-ape'

// Just use it! Calls are buffered until connected.
const result = await api.hello('World')

// Listen for broadcasts
api.on('message', ({ data }) => console.log(data))

// Track connection state
api.onConnectionChange((state) => {
  console.log('Connection:', state)
  // 'offline' | 'walled' | 'disconnected' | 'connecting' | 'connected'
})
```

**That's it!** Your server function is now callable from the browser.

---

## Key Concepts

* **Auto-wiring** — Drop JS files in a folder, they become API endpoints automatically
* **Real-time broadcasts** — Built-in `broadcast()` and `broadcastOthers()` methods for pushing to clients
* **Promise-based calls** — Chainable paths like `api.users.list()` map to `api/users/list.js`
* **Automatic reconnection** — Client auto-reconnects on disconnect with exponential backoff
* **HTTP streaming fallback** — Automatically falls back to long polling when WebSockets are blocked
* **JJS Encoding** — Extended JSON supporting Date, RegExp, Error, Set, Map, undefined, and circular refs
* **Connection lifecycle hooks** — Customize behavior on connect, receive, send, error, and disconnect
* **🌲 Forest** — Distributed mesh for horizontal scaling across multiple servers

---

## 🌲 Forest: Distributed Mesh

**Forest** enables horizontal scaling by coordinating multiple api-ape servers through a shared database. Messages are routed directly to the server hosting the destination client — no broadcast spam.

```js
import { createClient } from 'redis';
const redis = createClient();
await redis.connect();

// Join the mesh — that's it!
ape.joinVia(redis);
```

### Supported Backends

| Backend | Push Mechanism | Best For |
|---------|---------------|----------|
| **Redis** | PUB/SUB | Most deployments |
| **MongoDB** | Change Streams | Mongo-native stacks |
| **PostgreSQL** | LISTEN/NOTIFY | SQL shops |
| **Supabase** | Realtime | Supabase users |
| **Firebase** | Native push | Serverless/edge |

### How It Works

```
┌─────────────┐                    ┌─────────────┐
│  Server A   │                    │  Server B   │
│  client-1   │                    │  client-2   │
└──────┬──────┘                    └──────▲──────┘
       │                                  │
       │ 1. sendTo("client-2")            │
       │    → lookup: client-2 → srv-B    │
       │                                  │
       │ 2. channels.push("srv-B", msg)   │
       └──────────┬───────────────────────┘
                  │
           ┌──────▼──────┐
           │   Database  │
           │ (message    │
           │   bus)      │
           └─────────────┘
```

APE creates its own namespaced keys/tables (`ape:*` or `ape_*`). No schema conflicts with your data.

👉 **[See detailed Forest documentation](server/README.md#forest-distributed-mesh)**

---

## API Reference

### Server

#### `ape(server, options)`

Initialize api-ape on a Node.js HTTP/HTTPS server.

| Option | Type | Description |
|--------|------|-------------|
| `server` | `http.Server` | Node.js HTTP or HTTPS server instance |
| `where` | `string` | Directory containing controller files (default: `'api'`) |
| `onConnect` | `function` | Connection lifecycle hook (see [Connection Lifecycle](#connection-lifecycle)) |

#### Controller Context (`this`)

Inside controller functions, `this` provides:

| Property | Description |
|----------|-------------|
| `this.broadcast(type, data)` | Send to **ALL** connected clients |
| `this.broadcastOthers(type, data)` | Send to all **EXCEPT** the caller |
| `this.clientId` | Unique ID of the calling client (generated by api-ape) |
| `this.sessionId` | Session ID from cookie (set by outer framework, may be `null`) |
| `this.req` | Original HTTP request |
| `this.socket` | WebSocket instance |
| `this.agent` | Parsed user-agent (browser, OS, device) |

#### `ape.clients`

A read-only Map of connected clients. Each client provides:

| Property | Description |
|----------|-------------|
| `clientId` | Unique client identifier |
| `sessionId` | Session ID from cookie (may be `null`) |
| `embed` | Embedded values from onConnect |
| `agent` | Parsed user-agent (browser, OS, device) |
| `sendTo(type, data)` | Send a message to this specific client |

### Client

#### `api.<path>.<method>(...args)`

Call a server function. Returns a Promise.

```js
// Calls api/users/list.js
const users = await api.users.list()

// Calls api/users/create.js with data
const user = await api.users.create({ name: 'Alice' })

// Nested paths work too
// api.admin.users -> api/admin/users.js
// api.admin.users.delete -> api/admin/users/delete.js
await api.admin.users.delete(userId)
```

#### `api.on(type, handler)`

Listen for server broadcasts.

```js
api.on('notification', ({ data, err, type }) => {
  console.log('Received:', data)
})
```

#### `api.transport`

Get the currently active transport type. This is a read-only property.

```js
console.log(api.transport) // 'websocket' | 'polling' | null
```

#### `api.onConnectionChange(handler)`

Listen for connection state changes.

```js
const unsubscribe = api.onConnectionChange((state) => {
  console.log('Connection state:', state)
})

// Later: stop listening
unsubscribe()
```

**Connection States:**

| State | Description |
|-------|-------------|
| `offline` | Browser reports no network (`navigator.onLine = false`) |
| `walled` | Captive portal detected (can't reach server) |
| `disconnected` | Had connection, lost it |
| `connecting` | Actively connecting to server |
| `connected` | Connected and ready |

---

## Configuration

### Default Options

```js
ape(server, {
  where: 'api'  // Controller directory
})
```

### Connection Lifecycle Hook

Customize behavior per connection:

```js
ape(server, {
  where: 'api',
  onConnect(socket, req, clientId) {
    return {
      // Embed values into `this` for all controllers
      embed: {
        userId: req.session?.userId,
        id: String(clientId)
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
      onDisconnect: () => console.log('Client left')
    }
  }
})
```

---

## Common Recipes

### Broadcast to Other Clients

```js
// api/message.js
module.exports = function(data) {
  // Broadcast to all OTHER connected clients (not the sender)
  this.broadcastOthers('message', data)
  return { success: true }
}
```

### Broadcast to All Clients

```js
// api/announcement.js
module.exports = function(announcement) {
  // Broadcast to ALL connected clients including sender
  this.broadcast('announcement', announcement)
  return { sent: true }
}
```

### Using ape.clients

```js
const { ape } = require('api-ape')

// Get online count
console.log('Online:', ape.clients.size)

// Get all client IDs
const clientIds = Array.from(ape.clients.keys())

// Send to a specific client
const client = ape.clients.get(someClientId)
if (client) {
  client.sendTo('notification', { message: 'Hello!' })
}

// Iterate all clients
ape.clients.forEach((client, clientId) => {
  console.log(`Client ${clientId}:`, client.sessionId, client.agent.browser.name)
})
```

### Access Request Data

```js
// api/profile.js
module.exports = function() {
  // Access original HTTP request
  const userId = this.req.session?.userId
  const userAgent = this.agent.browser.name
  
  return { userId, userAgent }
}
```

### Error Handling

```js
// api/data.js
module.exports = async function(id) {
  try {
    const data = await fetchData(id)
    return data
  } catch (err) {
    // Errors are automatically sent to client
    throw new Error(`Failed to fetch: ${err.message}`)
  }
}
```

### Client-Side Error Handling

```js
try {
  const result = await api.data.get(id)
  console.log(result)
} catch (err) {
  console.error('Server error:', err)
}
```

---

## Examples & Demos

The repository contains working examples:

* **[`example/ExpressJs/`](example/ExpressJs/)** — Simple real-time chat app
  - Minimal setup with Express.js
  - Broadcast messages to other clients
  - Message history

* **[`example/NextJs/`](example/NextJs/)** — Production-ready chat application
  - Custom Next.js server integration
  - React hooks integration
  - User presence tracking
  - Docker support
  - Connection lifecycle hooks

* **[`example/Vite/`](example/Vite/)** — Vite + Vue example
* **[`example/Bun/`](example/Bun/)** — Bun runtime example

### Run an Example

**ExpressJs:**
```bash
cd example/ExpressJs
npm install
npm start
# Open http://localhost:3000
```

**NextJs:**
```bash
cd example/NextJs
npm install
npm run dev
# Open http://localhost:3000
```

Or with Docker:
```bash
cd example/NextJs
docker-compose up --build
```

---

## Tests & CI

```bash
npm test            # Run test suite
npm run test:watch  # Watch mode
npm run test:cover  # Coverage report
```

**Test Commands:**
- `npm test` — Run all tests
- `npm run test:watch` — Watch mode for development
- `npm run test:cover` — Generate coverage report

**Supported:** Node.js 14+, modern browsers (Chrome, Firefox, Safari, Edge)

---

## Contributing

Contributions welcome! Here's how to help:

1. **Fork the repository**
2. **Create a branch:** `git checkout -b feature/your-feature-name`
3. **Make your changes** and add tests
4. **Run tests:** `npm test`
5. **Commit:** Follow conventional commit messages
6. **Push and open a PR** with a clear description

**Guidelines:**
* Add tests for new features
* Keep code style consistent
* Update documentation if needed
* Ensure all tests pass

---

## Releases / Changelog

Versioning follows [Semantic Versioning](https://semver.org/).

**Current version:** See `package.json` or npm registry

**Release notes:** Check [GitHub releases](https://github.com/codemeasandwich/api-ape/releases) for detailed changelog.

---

## Zero Dependencies

api-ape has **zero runtime dependencies**. The WebSocket implementation is built-in:

- **Node.js 24+**: Uses native `node:ws` module
- **Bun / Deno**: Uses framework-provided WebSocket support
- **Earlier Node.js**: Uses built-in RFC 6455 compliant WebSocket server

No `npm install` surprises, no dependency audits, no supply chain concerns.

---

## Security

**Reporting vulnerabilities:** Please report security issues via [GitHub Security Advisories](https://github.com/codemeasandwich/api-ape/security/advisories) or email the maintainer.

### CSRF Protection

api-ape includes built-in **Cross-Site Request Forgery (CSRF)** protection via Origin validation:

- **Origin Header Check** — Every WebSocket connection validates the `Origin` header against the `Host` header
- **Automatic Rejection** — Connections from mismatched origins are destroyed immediately
- **No Configuration Needed** — Protection is enabled by default

This prevents malicious sites from making requests to your api-ape server while impersonating logged-in users.

### Security Considerations

* Validate all input in controllers
* Use authentication/authorization in `onConnect` hooks
* Sanitize data before broadcasting
* Keep dependencies up to date

---

## Project Structure

```
api-ape/
├── client/
│   ├── index.js             # Unified client entry point (auto-buffered)
│   ├── browser.js           # Browser entry point (window.ape)
│   ├── connectSocket.js     # WebSocket client with auto-reconnect
│   └── transports/
│       └── streaming.js     # HTTP streaming fallback transport
├── server/
│   ├── lib/
│   │   ├── main.js          # HTTP server integration
│   │   ├── loader.js        # Auto-loads controller files
│   │   ├── broadcast.js     # Client tracking & broadcast
│   │   ├── wiring.js        # WebSocket handler setup
│   │   ├── fileTransfer.js  # Binary file transfer via HTTP
│   │   ├── longPolling.js   # HTTP streaming fallback handler
│   │   ├── bun.js           # Bun runtime support
│   │   ├── wsProvider.js    # WebSocket provider abstraction
│   │   └── ws/              # Native WebSocket implementation
│   ├── socket/
│   │   ├── open.js          # Connection handler
│   │   ├── receive.js       # Incoming message handler
│   │   └── send.js          # Outgoing message handler
│   ├── security/
│   │   ├── reply.js         # Duplicate request protection
│   │   ├── origin.js        # Origin validation
│   │   └── extractRootDomain.js # Domain extraction utility
│   └── utils/
│       ├── deepRequire.js   # Deep module loader
│       ├── genId.js         # ID generation
│       └── parseUserAgent.js # Browser/OS/device parser
├── utils/
│   ├── jss.js               # JSON SuperSet encoder/decoder
│   └── messageHash.js       # Request deduplication hashing
└── example/
    ├── ExpressJs/           # Minimal chat app example
    ├── NextJs/              # Next.js production example
    ├── Vite/                # Vite/Vue example
    └── Bun/                 # Bun runtime example
```

---

## Troubleshooting & FAQ

### CORS Errors in Browser

Ensure your server allows WebSocket connections from your origin. api-ape uses the `ws` library which handles WebSocket upgrades on the HTTP server level.

### Controller Not Found

* Check that your controller file is in the `where` directory (default: `api/`)
* Ensure the file exports a function: `module.exports = function(...) { ... }`
* File paths map directly: `api/users/list.js` → `api.users.list()`

### Connection Drops Frequently

The client automatically reconnects with exponential backoff. If connections drop often:
* Check server WebSocket timeout settings
* Verify network stability
* Check server logs for errors

### Binary Data / File Transfers

api-ape supports transparent binary file transfers. Simply return `Buffer` data from controllers:

```js
// api/files/download.js
module.exports = function(filename) {
  return {
    name: filename,
    data: fs.readFileSync(`./uploads/${filename}`)  // Buffer
  }
}
```

The client receives `ArrayBuffer` automatically:

```js
const result = await api.files.download('image.png')
console.log(result.data)  // ArrayBuffer

// Display as image
const blob = new Blob([result.data])
img.src = URL.createObjectURL(blob)
```

**Uploads work the same way:**

```js
// Client
const arrayBuffer = await file.arrayBuffer()
await api.files.upload({ name: file.name, data: arrayBuffer })

// Server (api/files/upload.js)
module.exports = function({ name, data }) {
  fs.writeFileSync(`./uploads/${name}`, data)  // data is Buffer
  return { success: true }
}
```

### TypeScript Support

Type definitions are included (`index.d.ts`). For full type safety, you may need to:
* Define interfaces for your controller parameters and return types
* Use type assertions when calling `api.<path>.<method>()`

---

## License & Authors

**License:** MIT

**Author:** [Brian Shannon](https://www.linkedin.com/in/brianshann/)

**Repository:** [github.com/codemeasandwich/api-ape](https://github.com/codemeasandwich/api-ape)

---

**Made with 🦍 by the api-ape community**
