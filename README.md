# 🦍 api-ape

[![npm version](https://img.shields.io/npm/v/api-ape.svg)](https://www.npmjs.com/package/api-ape)
[![GitHub issues](https://img.shields.io/github/issues/codemeasandwich/api-ape)](https://github.com/codemeasandwich/api-ape/issues)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](server/README.md#zero-dependency-websocket)
[![Dependabot](https://img.shields.io/dependabot/codemeasandwich/api-ape)](https://github.com/codemeasandwich/api-ape/security/dependabot)
[![CSRF protected](https://img.shields.io/badge/CSRF%20🚷-protected-green.svg)](client/README.md#security)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/api-ape)](https://bundlephobia.com/package/api-ape)
[![JSS Encoding](https://img.shields.io/badge/encoding-JSS-blue.svg)](server/README.md)
[![license](https://img.shields.io/npm/l/api-ape.svg)](https://github.com/codemeasandwich/api-ape/blob/main/LICENSE)

![api-ape logo](assets/apiApeLogo.jpg)

**Remote Procedure Events (RPE)** — A lightweight WebSocket framework for building real-time APIs. Call server functions from the browser like local methods. Get real-time broadcasts with zero setup.

---

## Install

```bash
npm install api-ape
```

**Requirements:** Node.js 14+ (for server), modern browsers (for client)

---

## Quick Start

### Server (`ape`)

```js
const { createServer } = require('http')
const { ape } = require('api-ape')

const server = createServer()
ape(server, { where: 'api' })  // Load controllers from ./api folder
server.listen(3000)
```

### Controllers

Drop a file in your `api/` folder — it automatically becomes an endpoint:

```js
// api/hello.js
module.exports = function(name) {
  return `Hello, ${name}!`
}

// api/message.js  
module.exports = function(text) {
  this.broadcastOthers('message', { text, from: this.clientId })
  return { sent: true }
}
```

### Client (`api`)

**Browser:**
```html
<script src="/api/ape.js"></script>
<script>
  const result = await api.hello('World')  // "Hello, World!"

  // Subscribe to messages (pass a callback)
  const unsub = api.message(data => console.log(data))
</script>
```

**Bundlers (React, Vue, etc.):**
```js
import api from 'api-ape'

const result = await api.hello('World')

// Subscribe (pass callback) vs RPC call (pass data)
const unsub = api.message(data => console.log(data))  // Subscribe
await api.message({ text: 'Hello' })                   // RPC call
```

---

## Key Concepts

* **[Auto-wiring](server/README.md#auto-routing)** — Drop JS files in a folder, they become API endpoints
* **[Real-time broadcasts](server/README.md#controller-context-this)** — Built-in `broadcast()` and `broadcastOthers()` methods
* **[Pub/Sub channels](server/README.md#pubsub-channels)** — Clients subscribe to channels, server publishes updates
* **[Promise-based calls](client/README.md#usage)** — `api.users.list()` maps to `api/users/list.js`
* **[Automatic reconnection](client/README.md#features)** — Client reconnects with exponential backoff
* **[HTTP fallback](server/README.md#http-streaming-endpoints)** — Falls back to long polling when WebSockets are blocked
* **[JSS Encoding](server/README.md#troubleshooting--faq)** — Supports Date, RegExp, Error, Set, Map over the wire
* **[🌲 Forest](server/README.md#-forest-distributed-mesh)** — Distributed mesh for horizontal scaling
* **[🔐 Authentication](server/README.md#authentication)** — OPAQUE/PAKE auth with tiered access control

---

## Examples

* **[`example/ExpressJs/`](example/ExpressJs/)** — Simple real-time chat
* **[`example/NextJs/`](example/NextJs/)** — Production chat with React & Docker
* **[`example/Vite/`](example/Vite/)** — Vite + Vue
* **[`example/Bun/`](example/Bun/)** — Bun runtime

```bash
cd example/ExpressJs && npm install && npm start
```

---

## Documentation

| Docs | Description |
|------|-------------|
| **[Server README](server/README.md)** | API reference, lifecycle hooks, auto-routing, file transfers, 🌲 Forest |
| **[Client README](client/README.md)** | Client usage, connection states, file transfers, security |
| **[Auth README](server/security/auth/README.md)** | OPAQUE authentication, tiered access, authorization |
| **[Adapters README](server/adapters/README.md)** | Database adapters for Forest |

---

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/your-feature`
3. Make changes and add tests
4. Run tests: `npm test`
5. Push and open a PR

### Tests

```bash
npm test            # Run tests
npm run test:watch  # Watch mode
npm run test:cover  # Coverage
```

---

## License

**MIT** — [Brian Shannon](https://www.linkedin.com/in/brianshann/)

**Made with 🦍 by the api-ape community**
