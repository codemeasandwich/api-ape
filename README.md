# 🦍 api-ape

[![npm version](https://img.shields.io/npm/v/api-ape.svg)](https://www.npmjs.com/package/api-ape)
[![license](https://img.shields.io/npm/l/api-ape.svg)](https://github.com/codemeasandwich/api-ape/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/codemeasandwich/api-ape)](https://github.com/codemeasandwich/api-ape/issues)

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

### Server (Express.js)

```js
const express = require('express')
const ape = require('api-ape')

const app = express()

// Wire up api-ape - loads controllers from ./api folder
ape(app, { where: 'api' })

app.listen(3000)
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
  const result = await ape.hello('World')
  console.log(result) // "Hello, World!"
  
  // Listen for broadcasts
  ape.on('message', ({ data }) => {
    console.log('New message:', data)
  })
</script>
```

**That's it!** Your server function is now callable from the browser.

---

## Key Concepts

* **Auto-wiring** — Drop JS files in a folder, they become API endpoints automatically
* **Real-time broadcasts** — Built-in `broadcast()` and `broadcastOthers()` methods for pushing to clients
* **Promise-based calls** — Chainable paths like `ape.users.list()` map to `api/users/list.js`
* **Automatic reconnection** — Client auto-reconnects on disconnect with exponential backoff
* **JJS Encoding** — Extended JSON supporting Date, RegExp, Error, Set, Map, undefined, and circular refs
* **Connection lifecycle hooks** — Customize behavior on connect, receive, send, error, and disconnect

---

## API Reference

### Server

#### `ape(app, options)`

Initialize api-ape on an Express app.

| Option | Type | Description |
|--------|------|-------------|
| `where` | `string` | Directory containing controller files (default: `'api'`) |
| `onConnent` | `function` | Connection lifecycle hook (see [Connection Lifecycle](#connection-lifecycle)) |

#### Controller Context (`this`)

Inside controller functions, `this` provides:

| Property | Description |
|----------|-------------|
| `this.broadcast(type, data)` | Send to **ALL** connected clients |
| `this.broadcastOthers(type, data)` | Send to all **EXCEPT** the caller |
| `this.online()` | Get count of connected clients |
| `this.getClients()` | Get array of connected hostIds |
| `this.hostId` | Unique ID of the calling client |
| `this.req` | Original HTTP request |
| `this.socket` | WebSocket instance |
| `this.agent` | Parsed user-agent (browser, OS, device) |

### Client

#### `ape.<path>.<method>(...args)`

Call a server function. Returns a Promise.

```js
// Calls api/users/list.js
const users = await ape.users.list()

// Calls api/users/create.js with data
const user = await ape.users.create({ name: 'Alice' })

// Nested paths work too
// ape.admin.users -> api/admin/users.js
// ape.admin.users.delete -> api/admin/users/delete.js
await ape.admin.users.delete(userId)
```

#### `ape.on(type, handler)`

Listen for server broadcasts.

```js
ape.on('notification', ({ data, err, type }) => {
  console.log('Received:', data)
})
```

---

## Configuration

### Default Options

```js
ape(app, {
  where: 'api',           // Controller directory
  onConnent: undefined    // Lifecycle hook (optional)
})
```

### Connection Lifecycle Hook

Customize behavior per connection:

```js
ape(app, {
  where: 'api',
  onConnent(socket, req, hostId) {
    return {
      // Embed values into `this` for all controllers
      embed: {
        userId: req.session?.userId,
        clientId: String(hostId)
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

### Get Online Count

```js
// api/stats.js
module.exports = function() {
  return {
    online: this.online(),
    clients: this.getClients()
  }
}
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
  const result = await ape.data.get(id)
  console.log(result)
} catch (err) {
  console.error('Server error:', err)
}
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

This is automatic — send a Date, receive a Date. No configuration needed.

---

## Examples & Demos

The repository contains working examples:

* **`example/ExpressJs/`** — Simple real-time chat app
  - Minimal setup with Express.js
  - Broadcast messages to other clients
  - Message history

* **`example/NextJs/`** — Production-ready chat application
  - Custom Next.js server integration
  - React hooks integration
  - User presence tracking
  - Docker support
  - Connection lifecycle hooks

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

## Troubleshooting & FAQ

### CORS Errors in Browser

Ensure your Express server allows WebSocket connections from your origin. api-ape uses `express-ws` which handles CORS automatically, but verify your Express CORS middleware allows WebSocket upgrade requests.

### Controller Not Found

* Check that your controller file is in the `where` directory (default: `api/`)
* Ensure the file exports a function: `module.exports = function(...) { ... }`
* File paths map directly: `api/users/list.js` → `ape.users.list()`

### Connection Drops Frequently

The client automatically reconnects with exponential backoff. If connections drop often:
* Check server WebSocket timeout settings
* Verify network stability
* Check server logs for errors

### Binary Data / File Uploads

JJS encoding supports complex types, but for large binary data, consider:
* Sending file URLs instead of raw data
* Using a separate file upload endpoint
* Chunking large payloads

### TypeScript Support

Type definitions are included (`index.d.ts`). For full type safety, you may need to:
* Define interfaces for your controller parameters and return types
* Use type assertions when calling `ape.<path>.<method>()`

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
- `npm run test:update` — Update snapshots

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

## Security

**Reporting vulnerabilities:** Please report security issues via [GitHub Security Advisories](https://github.com/codemeasandwich/api-ape/security/advisories) or email the maintainer.

**Security considerations:**
* Validate all input in controllers
* Use authentication/authorization in `onConnent` hooks
* Sanitize data before broadcasting
* Keep dependencies up to date

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
│       └── reply.js      # Duplicate request protection
├── utils/
│   ├── jss.js           # JSON SuperSet encoder/decoder
│   └── messageHash.js   # Request deduplication
└── example/
    ├── ExpressJs/       # Chat app example
    └── NextJs/          # Next.js integration
```

---

## License & Authors

**License:** MIT

**Author:** [Brian Shannon](https://github.com/codemeasandwich)

**Repository:** [github.com/codemeasandwich/api-ape](https://github.com/codemeasandwich/api-ape)

---

**Made with 🦍 by the api-ape community**
