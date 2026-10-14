# 🦍 api-ape Server

## Overview

The server module provides the backend infrastructure for api-ape's WebSocket-based Remote Procedure Events (RPE) system. It transforms a standard Node.js or Bun HTTP server into a real-time API server where client function calls are automatically routed to controller files.

**Key capabilities:**

- **Auto-routing** — Drop JavaScript files in a folder, they become API endpoints automatically
- **Real-time broadcasts** — Built-in `broadcast()` and `broadcastOthers()` for pushing events to clients
- **Connection lifecycle** — Hooks for `onConnect`, `onDisconnect`, `onReceive`, `onSend`, `onError`
- **Binary transfers** — Transparent file upload/download with streaming support
- **HTTP fallback** — Long-polling transport when WebSocket is blocked
- **Multi-runtime** — Works on Node.js, Bun, and Deno
- **Logical WebSocket reconnect (Phase 1)** — Clients may reuse the same server `clientId` within `APE_RESUME_TTL_MS` when reconnecting with `?resume=` and a matching `sessionId` (see below)
- **Zero dependencies** — Built-in RFC 6455 WebSocket implementation (or uses native when available)
- **🌲 Forest** — Distributed mesh for horizontal scaling across multiple servers

The server integrates with Express.js, raw Node.js HTTP servers, and Bun's native server.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```bash
npm i api-ape
```

### Import

```js
// CommonJS
const api = require('api-ape')           // Client proxy (default)
const { ape } = require('api-ape')       // Server initializer

// ESM
import api, { ape } from 'api-ape'
```

### Basic Server Setup

```js
const { createServer } = require('http')
const { ape } = require('api-ape')

const server = createServer()

ape(server, {
  where: 'api',        // Controller directory
  onConnect: (socket, req, send) => ({
    embed: { userId: req.session?.userId },
    onDisconnect: () => console.log('Client left')
  })
})

server.listen(3000)
```

## WebSocket logical reconnect (Phase 1)

Transient disconnects should not always imply a brand-new logical client. After the server sends `__connected__` with `{ clientId, sessionId }`, well-behaved clients remember **`clientId` in memory** and send **`?resume=<clientId>`** on the next WebSocket upgrade when reconnecting. The handshake must still carry **`sessionId`** (cookie `sessionId` or header **`x-ape-session-id`**); if the browser sent neither, the server **mints** `sessionId` once per connection and echoes it in `__connected__` so clients can persist it for later upgrades.

**Resume rules (single-process scope today):**

| Input | Behavior |
|-------|----------|
| Valid `(sessionId, clientId)` within TTL after disconnect | Same `clientId`; superseded socket closed if a stale live row exists |
| Wrong session for `clientId`, expired TTL, or bad hint | Fresh `clientId` minted |
| Node outbound clients | Same pairing via **`resume`** query on the WS URL + **`Cookie: sessionId=…`** after first `__connected__`; optional **`x-ape-resume`** / **`resume`** headers |

**Environment:**

| Variable | Meaning |
|----------|---------|
| `APE_RESUME_TTL_MS` | How long (ms) a disconnected logical id stays resumable after socket close (default **120000**) |

Multi-node deployments without sticky routing need shared session storage (Phase 2 — see **`todo/resilient-transport-phase2.md`**). Browser HTTP streaming fallback still keys **`apeClientId`** separately from WebSocket resume; pairing LP with WS logical identity is optional follow-up.

Details for browser and Node callers: [Browser client README](../client/README.md#transient-network--logical-reconnect-phase-1) and [Server client README](./client/README.md#logical-reconnect-phase-1).


## Server-to-Server Connection

Your server can connect to **another** api-ape server as a client. The API is 100% identical to browser usage:

```js
const api = require('api-ape')
const { ape } = require('api-ape')

// Start your own server
ape(server, { where: 'api' })

// Connect to another api-ape server
api.connect('other-server', 3000)  // → ws://other-server:3000/api/ape

// Now use it exactly like browser code!
const result = await api.hello('World')
api.on('message', ({ data }) => console.log(data))

// Subscribe to a channel the other server publishes to (from 4.4.0 this sends the
// { subscribe } frame, so it receives; the first local subscriber subscribes, the
// last one to leave unsubscribes, and every reconnect subscribes again)
const off = api.news.banking((data) => console.log(data))
```

**Or set the connection URL via environment variable:**

```bash
APE_SERVER=ws://other-server:3000/api/ape node app.js
```

This enables server-side microservice patterns while keeping the familiar api-ape interface.

## API

### `ape(server, options)`

| Option | Type | Description |
|--------|------|-------------|
| `where` | `string` | Directory containing controller files. Relative paths (e.g. `'api'`) are resolved against `process.cwd()` captured at module-load time. Absolute paths (e.g. `'/srv/myapp/api'`) are used verbatim — pass an absolute path when the calling process cannot guarantee a stable `cwd` (embedded servers, multi-tenant runners, test harnesses spawned from arbitrary directories). |
| `urlPrefix` | `string` | _Optional._ Public URL segment for api-ape routes (`/${urlPrefix}/ape`, `/${urlPrefix}/ape.js`, etc.). Defaults to `where` when `where` is relative (preserving the historical `/api/ape` shape), or to `path.basename(where)` when `where` is absolute. Override when the on-disk controller path and the public URL segment must differ. |
| `onConnect` | `function` | Connection lifecycle hook |
| `fileTransferOptions` | `object` | Binary transfer settings (see below) |
| `selector` | `string[]` | _Optional._ Controller file extensions to load, default `['js']` (`['js', 'ts']` under Bun). |
| `longPollingOptions` | `object` | _Optional, Node._ `{ heartbeatInterval, recycleTimeout }` for the HTTP long-poll fallback. |
| ~~`authFramework`~~ / ~~`authMiddleware`~~ | | **Not supported: `ape()` and `apeBun()` throw if given.** See [Authentication](#authentication). |
| `logging` | `boolean` \| `object` | Framework diagnostics (see [Framework logging](#framework-logging) below) |
| `origin` | `object` | _Optional._ WebSocket Origin policy `{ mode, allowedOrigins, allowedHosts }` (see [Origin check](#origin-check)). Node default `root-domain` (unchanged), Bun default `exact`. |
| `watch` | `boolean` \| `object` | _Optional, default off._ Hot-reload controllers on file change (see [Hot reload](#hot-reload)). |
| `websocketOptions` | `object` | _Bun only._ `Bun.serve` websocket tuning: `idleTimeout`, `sendPings`, `maxPayloadLength`, `backpressureLimit`, `closeOnBackpressureLimit`, `perMessageDeflate`, `publishToSelf` (see [Keepalive and ping](#keepalive-and-ping)). |

### `apeBun(options)` (Bun)

`require('api-ape/bun').apeBun(options)` returns `{ fetch, websocket, wss, close }` for `Bun.serve()`. It takes the same options as `ape()` (`where`, `urlPrefix`, `selector`, `onConnect`, `fileTransferOptions`, `origin`, `watch`, `websocketOptions`, `logging`). `fetch` answers the api-ape paths and returns `null` for anything else, so your own routes can follow.

| Option | Type | Description |
|--------|------|-------------|
| `where` | `string` | As for `ape()` above. |
| `urlPrefix` | `string` | As for `ape()` above. |
| `selector` | `string[]` | _Optional._ File extensions (without dots) the controller loader scans. Defaults to `['js']`. Pass `['js', 'ts']` in a TypeScript project running under Bun so `.ts` controller files register alongside `.js` ones. |
| `onConnect` | `function` | As for `ape()` above. |
| `fileTransferOptions` | `object` | As for `ape()` above. |

```ts
const { apeBun } = require('api-ape/bun')
const ape = apeBun({ where: 'api', selector: ['js', 'ts'] })
Bun.serve({ port: 3000, fetch: (req, server) => ape.fetch(req, server) ?? new Response('Not found', { status: 404 }), websocket: ape.websocket })
```

### Framework logging

api-ape prints optional **internal** diagnostics (adapter join/leave, client add/remove, pub/sub lifecycle, wiring errors, hot-reload lines, etc.). Your own `console.log` calls in controllers and `onConnect` are unchanged.

Pass `logging` on `ape(server, options)`:

| Value | Behavior |
|-------|----------|
| Omitted or `true` | Internal logs use `console` (default; same as before this option existed). |
| `false` | Internal framework logs are suppressed (no-op sink). |
| `object` | Custom handlers: optional `log`, `warn`, `error`, `info`, `debug` functions. Any level you omit falls back to `console` for that level. |

```js
const { ape } = require('api-ape')

// Silence api-ape framework logs only
ape(server, { where: 'api', logging: false })

// Send framework errors through your logger
ape(server, {
  where: 'api',
  logging: {
    error: (...args) => myLogger.error('api-ape', ...args),
    // log, warn, info, debug still use console if omitted
  },
})
```

You can also set the sink **before** `ape()` (or from another module) with the named export:

```js
const { configureApeLogging, ape } = require('api-ape')

configureApeLogging(false)
ape(server, { where: 'api' }) // inherits the same sink
```

For **Node.js outbound clients** (same package, server-to-server), see [Server Client README](../client/README.md#framework-logging) and [`client/README.md`](../../client/README.md#framework-logging) for the browser.

**Pub/sub publish tracing:** Extra per-publish lines in the pub/sub layer are still gated by the environment variable `APIAPE_PUBSUB_LOG` (see [`server/lib/broadcast/pubsub.js`](./lib/broadcast/pubsub.js)). When framework `logging` is `false`, those messages are discarded even if `APIAPE_PUBSUB_LOG` is enabled, because they go through the same internal logger.

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
| `this.send(type, data)` | Push to the calling client only |
| `this.publish(channel, data)` | Send to all subscribers of a channel |
| `this.clients` | Read-only `Map` of connected clients (`this.clients.size` is the online count; iterate it for the ids) |
| `this.keepalive()` | Restart the caller's 10 s timer during slow work ([Keepalive and ping](#keepalive-and-ping)) |
| `this.clientId` | Unique ID of the calling client (generated by api-ape) |
| `this.sessionId` | Session ID from cookie (set by outer framework, may be `null`) |
| `this.req` | Original HTTP request |
| `this.socket` | WebSocket instance |
| `this.agent` | Parsed user-agent |
| `this.isAuthenticated`, `this.authTier`, `this.principal`, `this.requiresTier(n)` | Auth state. Always `false` / `0` / `null` / `() => false`: the auth options are not wired (see [Authentication](#authentication)). |

`this.broadcast` and `this.broadcastOthers` exist from 4.4.0 (the 4.3.0 docs listed them but the context did not provide them). If your `onConnect` already returns an `embed` with a `broadcast` or `broadcastOthers` of its own, yours wins (from 4.4.0). There is no `this.online()` or `this.getClients()`; use `this.clients`. Each call runs on its own context, so `this.foo = x` inside a controller is private to that call; keep per-connection state in `onConnect`'s `embed`.

### Connection Lifecycle Hooks

```js
onConnect(socket, req, send) {
  return {
    embed: { ... },          // Values available as this.* in controllers
    onReceive: (queryId, data, type) => afterFn,
    onSend: (data, type) => afterFn,
    onError: (errStr) => { ... },
    onDisconnect: () => { ... }
  }
}
```

## Auto-Routing

Drop JS files in your `where` directory:

```
api/
├── hello.js      → api.hello(data)
├── users.js      → api.users(data)
├── posts/
│   ├── index.js  → api.posts(data)     # index.js maps to parent folder
│   ├── list.js   → api.posts.list(data)
│   └── create.js → api.posts.create(data)
```

**Note**: Both `api/users.js` and `api/users/index.js` map to the same endpoint `api.users(data)`. Use `index.js` when you want to group related files in a folder.

**⚠️ Duplicate Detection**: If both files exist, api-ape will throw an error on startup:
```
🦍 Duplicate endpoint detected: "users"
   - /users/index.js
   - /users.js
   Remove one of these files to fix this conflict.
```

### Controller files

- A controller file exports a function: `module.exports = function (data) { ... }` or `export default function (data) { ... }` (a function `default` is used).
- Any other export (an object, a number) stops startup with an error naming the file, instead of failing at the first call with "controller.call is not a function".
- `*.d.ts` declaration files and `*.test.*` / `*.spec.*` files in the controller folder are not endpoints and are never loaded.
- A TypeScript controller that mixes `import` with `module.exports` does not load under Bun; use `export default` or plain `module.exports`.

### Errors

A controller that throws rejects the caller's promise with an `Error` that keeps its class and message (`TypeError`, `RangeError`, any `name` you set; the server's stack is not sent, so no file paths reach a browser). Attach `code` and `data` to carry details: `throw Object.assign(new Error('conflict'), { code: 'CONFLICT', data: { current: 3 } })` arrives as `err.code` and `err.data`. A thrown string arrives as `new Error(string)`. A controller that returns nothing replies with `undefined`.

**What `code` and `data` may carry (4.4.0).** A thrown value is the output of whatever your controller called, libraries included, so only what you put on an error yourself is forwarded: `code` when it is an own, enumerable property holding a string or a number; `data` when it is an own, enumerable property holding plain data (strings, numbers, booleans, `null`, arrays, plain objects and `Date`s, nested under 32 levels, no cycles). A function, a class instance (`Map`, `Buffer`, another `Error`), a `BigInt` or a getter on the prototype is dropped, and the error still arrives with its class and message. Nothing is forwarded from a Node system error (anything with `syscall` or `errno`: `ECONNREFUSED`, `ENOENT` carry paths and addresses). So attach `code` and `data` to errors **you** throw, and catch and rethrow a library's error as your own. A thrown plain object arrives as itself, without its own `stack`; one that cannot be serialised (a `BigInt` inside it) arrives as an `Error` saying so, rather than leaving the caller waiting for its timeout.

### Hot Reload

Hot reload is **off by default** (it used to be always on, which loaded files changed on disk into a running production process). Opt in during development:

```js
ape(server, { where: 'api', watch: true })                       // watch only ./api
ape(server, { where: 'api', watch: { paths: ['services'] } })    // ...and the service modules it imports
ape(server, { where: 'api', watch: { paths: ['services'], debounceMs: 100 } })
ape(server, { where: 'api', watch: { recursive: false } })       // force one watcher per directory
```

When a watched file changes, api-ape waits `debounceMs` (default 50), evicts **every module under the watched directories** from `require.cache` (except `node_modules`), re-requires **all** controllers and swaps the new set into the live controller map. Controllers and the services they import are therefore reloaded together, so a controller never keeps a stale import. If any controller fails to load (syntax error, duplicate endpoint) the previous set keeps serving and the error is logged:

```
Reloaded 12 controllers (changed: users/list.js, ../services/db.js)
[api-ape] Reload failed, still serving the previous controllers: ...
```

Limits, stated plainly:

- Only modules under the controller directory and `watch.paths` are evicted. A module outside them (a database singleton, a shared library) stays cached and is not reloaded. Listing its directory in `watch.paths` reloads it, and a module that opens a connection at load time will open a new one and leave the old one open.
- State captured by the old modules (connections, timers, subscriptions, objects already handed to clients) is not migrated or closed. A call already running finishes on the old code.
- Eviction uses `require.cache`. On Node that means CommonJS only; ES modules loaded with `import` are never evicted. Bun 1.3.14 evicts `require()`d `.js` and `.ts` modules (tested); `import`ed ESM reloaded in a manual probe but is untested, so use `bun --hot` if you rely on it.
- Watching works the same on every platform. Where recursive `fs.watch` exists (macOS, Windows, Linux with Node 20+) api-ape opens one recursive watcher per watched directory. Elsewhere (Linux before Node 20), or with `watch: { recursive: false }`, it opens one non-recursive watcher per directory (skipping `node_modules` and dot-directories) and adds a watcher for every directory created while running. A very large tree can exhaust the OS watch limit (inotify) in that mode; that is reported as a warning, not fatal.
- Stop it with `close()` on the object returned by `apeBun`; for `ape(server, ...)` call `require('api-ape/server/utils/deepRequire').stopWatching(ape(...).core.controllers)`. The watchers are unref'd, so they never keep a process alive. The Vite plugin turns `watch` on by default (it only runs under `vite serve`) and stops the old watcher when Vite restarts.
- A call that is already running mostly finishes on the old code, but a lazy `require()` inside it made after an eviction loads the new module. If a reload fails, the evicted modules are put back, so old controllers that `require()` lazily keep getting the old modules.
- `watch.paths` is resolved against `process.cwd()` when `ape` starts (`where` uses the cwd captured at module load); pass absolute paths. api-ape's own modules are never evicted. Any `.js .cjs .mjs .ts .mts .cts .jsx .tsx .json` change under a watched directory triggers a reload. Do not point `paths` at the app root: it would watch `node_modules`.

Deleting a controller file now removes its endpoint (the old watcher ignored deletes).

### Origin check

A WebSocket upgrade carrying an `Origin` header is checked against the request's `Host`. A request without `Origin` (non-browser clients) is always allowed.

| `origin.mode` | Rule | Default on |
|---|---|---|
| `root-domain` | Root domains must match; **ports are ignored**, so `http://localhost:9999` passes for a server on `localhost:3000`. Subdomains of one root match each other. | Node (unchanged) |
| `exact` | Scheme-normalised host **and port** must match (`https://x` equals `x:443`). Another port of localhost is a different origin and is refused. `127.0.0.1` is not `localhost`. | Bun |

Extra controls, valid in either mode:

- `allowedOrigins: ['http://localhost:5173']` admits those exact origins (a Vite dev server, for example).
- `allowedHosts: ['localhost:4318', '127.0.0.1:4318']` refuses any request whose `Host` is not listed, even with no `Origin`. Use it on loopback servers to defeat DNS rebinding, where `evil.test` resolves to `127.0.0.1` and sends a matching `Origin` and `Host`.

A refused upgrade gets an HTTP `403` before the handshake completes on both Node and Bun, so `onConnect` and controllers are never reached (tested on both).

What `exact` does not give you:

- **The scheme is not checked against the real transport.** The `Origin` scheme is used to normalise the `Host` (so `https://x` equals `x:443`), but api-ape cannot see whether the connection itself was TLS. `http://example.com` against an HTTPS-served `example.com` passes. Do not rely on `Origin` for cookie-less secrecy; use `Secure`/`SameSite` cookies and your own auth.
- **DNS rebinding.** A rebound page at `evil.test:4318` sends a matching `Origin` and `Host`, so `exact` alone accepts it. On a loopback server, set `allowedHosts` (for example `['localhost:4318', '127.0.0.1:4318']`).
- **Reverse proxies that rewrite `Host`** (`Origin: https://app.example.com`, `Host: 127.0.0.1:3000`) are refused, because the two no longer match. Preserve `Host` at the proxy, or list the public origin in `allowedOrigins`.
- Options are validated at start-up: an unknown key (a misspelt `allowedHosts` would silently remove the guard), a non-string entry, or an `allowedOrigins` entry that is not an `http(s)` origin throws.

```js
ape(server, { where: 'api', origin: { mode: 'exact' } })                       // strict on Node
apeBun({ where: 'api', origin: { mode: 'root-domain' } })                      // legacy rule on Bun
apeBun({ where: 'api', origin: { allowedHosts: ['localhost:4318'] } })
```

### Bun

```js
const { apeBun } = require('api-ape/bun')
const ape = apeBun({ where: 'api', origin: { allowedHosts: ['localhost:4318'] } })
Bun.serve({
  port: 4318,
  fetch: (req, server) => ape.fetch(req, server) ?? new Response('Not found', { status: 404 }),
  websocket: ape.websocket,
})
```

`ape(server, ...)` on a `Bun.serve()` server works too and shares the same code. Under Bun:

- **Controllers see the same request as under Node.** `this.req.headers.cookie`, `this.req.headers['user-agent']`, `this.req.url` (path plus query), `this.req.socket.remoteAddress`, `this.agent` and `this.sessionId` (cookie or `x-ape-session-id`) are populated, and resume pairing works. `this.req.headers.get(name)` and `.has(name)` still work; other `Headers` methods (`entries`, `forEach`, `getSetCookie`) do not, so read those from `this.req.rawRequest.headers` (the original Fetch `Request` is `this.req.rawRequest`). Before 4.3.0 a Fetch `Request` was passed through, so all of the Node-style reads were `undefined`: the Origin check never ran, every connect minted a new session, and `this.agent` was empty.
- **Transport is WebSocket only.** The HTTP long-poll fallback (`/{prefix}/ape/poll`), file transfer over HTTP (`/{prefix}/ape/data/...`) and the schema endpoint exist only in the Node runtime. `fetch` handles `/{prefix}/ape` (upgrade), `/{prefix}/ape.js` and `/{prefix}/ape/ping`, and returns `null` for everything else so your own routes can follow. This is fine on loopback; do not rely on the polling fallback behind hostile proxies.
- **State is a module singleton.** Under `bun --hot`, create the handlers once, for example `globalThis.__ape ??= apeBun({ where: 'api' })`.
- **Not provided:** HTTP/REST routing, validation, a database layer. The Vite plugin runs api-ape inside Vite's Node dev server, so controllers would run in Vite's process rather than in Bun; proxy the WebSocket to your Bun server instead.

### Keepalive and ping

Three separate mechanisms, often confused:

1. **`this.keepalive()` in a controller** resets the *client's* per-call timer (10 s by default) for a slow call. It sends `{ queryId, _keepalive: true }`; the call is not resolved. Call it at least every few seconds from long work. It does **not** extend the server's own freshness check on the incoming call (the server refuses a call whose `createdAt` is more than 10 s old, in the future, or a repeated `queryId`; this is checked once, on arrival). A call buffered by the client across a sleep or disconnect of more than 10 s is therefore refused, and pending calls are rejected when the socket closes, so there is no exactly-once delivery: keep mutations idempotent or revision-guarded. The browser client treats the frame as "still working": it restarts that call's timer and keeps waiting for the real reply (before 4.4.0 the client took the first keepalive for the reply and resolved the call with `undefined`). Every call runs on its own context layered over the connection's, so two concurrent calls each keepalive on their own `queryId`. A side effect: `this.foo = x` inside a controller is private to that call; keep per-connection state in `onConnect`'s `embed`.
2. **`GET /{prefix}/ape/ping`** is an HTTP reachability probe returning `{ ok, ts }`. The client uses it to detect captive portals (`walled`). It is not a WebSocket heartbeat.
3. **WebSocket liveness** belongs to the runtime. api-ape sends no ping frames of its own. Under Bun, the runtime sends protocol pings (`sendPings`, default `true`) and closes a socket that has been silent for `idleTimeout` seconds (default 120); browsers answer pings automatically, so an idle tab stays connected. Tune it with `websocketOptions: { idleTimeout, sendPings }`. Bun enforces the timeout on a coarse timer: measured on Bun 1.3.14, an `idleTimeout` of 2 or 5 both closed a silent socket at about 8 s, so treat it as approximate. Verified by `integration/bun/security.ts` (pings keep an idle socket open; without pings it closes).

## Pub/Sub Channels

api-ape includes a built-in pub/sub system for channel-based messaging. Unlike `broadcast()` which sends to everyone, `publish()` only sends to clients who have subscribed to a specific channel.

### Server Side

Use chained `ape.publish.channel.name(data)` syntax from anywhere on the server:

```js
const { ape } = require('api-ape')

// Publish from a controller
module.exports = function(data) {
  this.publish('/health', { status: 'ok', uptime: process.uptime() })
  return { published: true }
}

// Chained publish syntax (recommended)
ape.publish.stock.AAPL({ price: 185.50, change: 2.3 })
ape.publish.notifications({ message: 'System update!' })
ape.publish.news.banking({ headline: 'Market Update' })

// Legacy syntax (still supported)
ape.publish('/stock/AAPL', { price: 185.50, change: 2.3 })
```

### Client Side

Clients subscribe using the same chaining syntax. Pass a **callback function** to subscribe:

```js
// Subscribe to channels (pass a callback function)
const unsub1 = api.health(data => {
  console.log('Health update:', data)
})

const unsub2 = api.stock.AAPL(data => {
  console.log('AAPL:', data.price)
})

// Unsubscribe when done
unsub1()
unsub2()
```

**Key insight:** The same chaining syntax is used for both RPC calls and subscriptions. The difference is what you pass:
- **Data** → RPC call (returns Promise)
- **Callback function** → Subscription (returns unsubscribe function)

### Behavior

| Feature | Description |
|---------|-------------|
| **Last message cache** | New subscribers receive the last published message immediately |
| **Channel names** | Any string (e.g., `/health`, `/chat/room/123`, `/stock/AAPL`) |
| **Auto-cleanup** | Subscriptions are removed when client disconnects |
| **Message format** | Same as `broadcast()`: `{ type: channel, data: payload }` |

### Use Cases

- **Health monitoring** — Clients subscribe to `/health`, server publishes status periodically
- **Stock tickers** — Subscribe to `/stock/AAPL`, receive price updates
- **Chat rooms** — Subscribe to `/chat/room/123`, receive messages for that room only
- **User-specific updates** — Subscribe to `/user/123/notifications`

### Comparison with Broadcast

| Method | Sends To | Use Case |
|--------|----------|----------|
| `broadcast(type, data)` | ALL connected clients | Server announcements, global events |
| `broadcastOthers(type, data)` | All EXCEPT caller | Chat messages (don't echo back) |
| `publish(channel, data)` | Only subscribers of that channel | Targeted updates, topics |

## Direct Client Messaging

Access connected clients via `ape.clients` to send messages to specific clients.

### Accessing Clients

```js
const { ape } = require('api-ape')

// Iterate all connected clients
for (const [clientId, client] of ape.clients) {
  console.log(`Client ${clientId} connected`)
}

// Get a specific client
const client = ape.clients.get(clientId)

// Check client count
console.log(`${ape.clients.size} clients connected`)
```

### Sending to a Client

Each client wrapper has a `send` function that supports both direct and chained syntax:

```js
const client = ape.clients.get(clientId)

// Direct syntax
client.send('news/banking', { headline: 'Market Update' })

// Chained syntax (same result)
client.send.news.banking({ headline: 'Market Update' })

// Deep nesting works too
client.send.stocks.nasdaq.tech({ price: 100 })
```

### Client Properties

| Property | Type | Description |
|----------|------|-------------|
| `clientId` | `string` | Unique client identifier |
| `sessionId` | `string\|null` | Session ID from cookie |
| `embed` | `object` | Values from onConnect's `embed` return |
| `agent` | `object` | Parsed user-agent (browser, os, device) |
| `isAuthenticated` | `boolean` | Whether client is authenticated |
| `authTier` | `number` | Authentication tier (0-3) |
| `send` | `function` | Send message to this client |

## Authentication

api-ape includes a tiered authentication system with OPAQUE/PAKE support (server never learns raw passwords).

> **Not available through `ape()` / `apeBun()`.** The `authFramework` and `authMiddleware` options were accepted by 4.3.0 and earlier and then **silently dropped**, so nothing below was ever enforced. From 4.4.0 `ape()` and `apeBun()` **throw at startup** if either is passed. They are not wired because they would cover the WebSocket path only; the Node HTTP long-poll fallback has no auth hooks and would answer unauthenticated requests. Until a design that covers every transport lands, authenticate in `onConnect` (refuse the socket, or return `embed: { user }`) and check `this.user` in controllers. The modules below stay in the package as building blocks.

### Quick Setup (not wired, see the note above)

```js
const { createAuthFramework } = require('api-ape/server/security/auth');
const { createAuthMiddleware } = require('api-ape/server/socket/authMiddleware');

const authFramework = createAuthFramework({
  opaque: {
    getUser: async (username) => db.users.findOne({ username }),
    saveUser: async (username, data) => db.users.insertOne({ username, ...data })
  }
});

const authMiddleware = createAuthMiddleware({
  requirements: {
    'admin/*': { tier: 2 },  // Admin requires MFA
    'user/*': { tier: 1 },   // User requires auth
    'public/*': { tier: 0 }  // Public allows guests
  }
});

// ape(server, { where: 'api', authFramework, authMiddleware });  // throws since 4.4.0
```

### Authentication Tiers

| Tier | Name | Description |
|------|------|-------------|
| 0 | GUEST | Unauthenticated, public endpoints only |
| 1 | BASIC | Identity verified via OPAQUE or enterprise SSO |
| 2 | ELEVATED | Tier 1 + MFA (WebAuthn or TOTP) |
| 3 | HIGH_SECURITY | Full 2-of-3 scheme for client-side key reconstruction |

### Using Auth in Controllers

```js
// api/protected/data.js
module.exports = function(query) {
  if (!this.isAuthenticated) {
    throw new Error('Authentication required');
  }

  console.log('User:', this.principal.userId);
  console.log('Tier:', this.authTier);

  return { data: 'sensitive info' };
};
```

See [`security/auth/README.md`](security/auth/README.md) for full documentation.

---

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

### Client-to-Client File Streaming (`<!F>`)

For sharing files between clients (broadcasts), use the `<!F>` marker. Messages route immediately; file data transfers asynchronously with true streaming support.

```
Client A → Server: { msg: "here's a file", file<!F>: "hash123" }  + HTTP upload
Server → Client B: { msg: "here's a file", file<!F>: "hash123" }  (immediate)
Client B → Server: GET /api/ape/data/hash123                       (streams available bytes)
```

**Key differences from regular file transfer (`<!A>`/`<!B>`):**

| Feature | Regular (`<!A>`/`<!B>`) | Shared (`<!F>`) |
|---------|------------------------|-----------------|
| **Session check** | Required | Skipped |
| **Blocking** | Waits for upload | Non-blocking |
| **Partial download** | No | Yes (stream what's uploaded) |
| **Use case** | Client → Server | Client → Client via broadcast |

**Server-side flow:**

1. Message with `<!F>` received → streaming file registered
2. Controller invoked immediately (non-blocking)
3. When broadcast, `<!F>` tags pass through unchanged
4. HTTP upload completes streaming file
5. Other clients fetch from `/api/ape/data/:hash` (no session check)

**Response headers:**

| Header | Description |
|--------|-------------|
| `X-Ape-Complete` | `1` if upload finished, `0` if still streaming |
| `X-Ape-Total-Received` | Bytes received so far |

---

## HTTP Streaming Endpoints

api-ape automatically provides HTTP streaming endpoints as a fallback when WebSockets are blocked:

### GET `/api/ape/poll`

Long-lived HTTP streaming connection for receiving server messages.

- **Session**: Cookie-based (`apeClientId`)
- **Response**: Streaming JSON messages
- **Heartbeat**: Every 20 seconds
- **Auto-reconnect**: Client reconnects after 25 seconds

### POST `/api/ape/poll`

Send messages to server when using HTTP streaming transport.

- **Session**: Cookie-based (`apeClientId`)
- **Body**: JSS-encoded message
- **Response**: the same frame a WebSocket gets, JSS text: `{ data, type: false, queryId }` (`data<!U>` for a controller that returns nothing), or, with HTTP 500, `{ err, errCode?, errData?, type: false, queryId }`, and with HTTP 404 the "was not found" error. Before 4.4.0 an error was `{ err: "<message>", queryId }`, and `code` / `data` were lost.
- **Context**: the controller's `this` is built by the same code as on a WebSocket (`this.broadcast`, `this.broadcastOthers`, `this.publish`, `this.send`, `this.clients`, embed values, a per-call `this.keepalive()` that writes `{ queryId, _keepalive: true }` to the client's open GET stream, a private `this.foo`). One difference: an `embed` that names `clientId` or `sessionId` replaces them on this transport, as it always did; on a WebSocket the connection's own win.

### How It Works

1. Client attempts WebSocket connection first
2. On failure (firewall/proxy blocking), falls back to HTTP streaming
3. Background WebSocket retry every 30 seconds
4. Automatically upgrades back to WebSocket when available

The fallback is **completely transparent** to your controllers - they work identically with both transports.

---

## Zero-Dependency WebSocket

api-ape includes its own RFC 6455 WebSocket implementation with **zero npm dependencies**.

### Runtime Detection

The server automatically detects and uses the best available WebSocket implementation:

1. **Deno**: Uses native `Deno.upgradeWebSocket()` API
2. **Bun**: Uses native `Bun.serve()` WebSocket handlers
3. **Node.js 24+** (stable): Attempts the native `node:ws` module when present in the runtime
4. **Fallback**: Uses the built-in RFC 6455 polyfill (covers earlier Node versions and Node 24+ builds without `node:ws`)

```javascript
// Automatic - no configuration needed
ape(server, { where: 'api' })
```

### Polyfill Features

The built-in polyfill implements:

- Full RFC 6455 handshake (SHA-1 + GUID)
- Text and binary frames
- Frame fragmentation
- Ping/pong heartbeats
- Proper close handshake
- Masking (client→server)

---

## 🌲 Forest: Distributed Mesh

**Forest** is api-ape's distributed coordination system for horizontal scaling. It routes messages between servers via a shared database, enabling you to run multiple api-ape instances behind a load balancer.

### Quick Start

```js
const { ape } = require('api-ape');
const { createClient } = require('redis');

const redis = createClient();
await redis.connect();

// Join the mesh — pass any supported database client
ape.joinVia(redis);

// Graceful shutdown
process.on('SIGINT', async () => {
  await ape.leaveCluster();
  process.exit(0);
});
```

### The Problem Forest Solves

Without coordination, each server only knows about its own connected clients:

```
              Load Balancer
                   │
      ┌────────────┼────────────┐
      │            │            │
   Server A     Server B     Server C
   client-1     client-2     client-3
```

If Server A wants to send a message to `client-2`, it doesn't know where `client-2` is connected.

**Naive solutions:**
- **Broadcast to all servers** — O(n) messages, doesn't scale
- **Sticky sessions** — Complex LB config, no failover

**Forest's solution:**
- **Direct routing** — Lookup `clientId → serverId`, push only to that server. O(1).

### How It Works

Forest uses two database primitives:

| Primitive | Purpose | Example |
|-----------|---------|---------|
| **Lookup Table** | Maps `clientId → serverId` | Redis key, Postgres row |
| **Channels** | Real-time message push | Redis PUB/SUB, Postgres NOTIFY |

#### Message Flow

```
Server A: "Send message to client-2"
    │
    ▼
1. Check local clients → not found
    │
    ▼
2. lookup.read("client-2") → "srv-B"
    │
    ▼
3. channels.push("srv-B", { destClientId: "client-2", ... })
    │
    ▼
   Database (Redis/Postgres/Mongo/etc)
    │
    ▼
Server B: Receives message, delivers to client-2
```

### Supported Backends

| Backend | How to Connect | Channels | Lookup | Ideal For |
|---------|---------------|----------|--------|-----------|
| **Redis** | `createClient()` | PUB/SUB | Key-value | Most deployments; fastest |
| **MongoDB** | `new MongoClient()` | Change Streams | Collection | Mongo-native stacks |
| **PostgreSQL** | `new pg.Pool()` | LISTEN/NOTIFY | Table | SQL shops |
| **Supabase** | `createClient()` | Realtime | Table | Supabase users |
| **Firebase** | `getDatabase()` | Native push | JSON tree | Serverless/edge |

### API Reference

#### `ape.joinVia(client, options?)`

Join the distributed mesh.

```js
ape.joinVia(redis);
ape.joinVia(redis, { 
  namespace: 'myapp',     // Key/table prefix (default: 'apes')
  serverId: 'srv-west-1'  // Custom server ID (default: auto-generated)
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `namespace` | `string` | `'apes'` | Prefix for all keys/tables |
| `serverId` | `string` | Auto-generated | Unique ID for this server instance |

#### `ape.leaveCluster()`

Gracefully leave the mesh. Removes client mappings and unsubscribes from channels.

```js
await ape.leaveCluster();
```

### Namespacing

Forest creates its own database objects with your namespace prefix:

| Backend | Created Objects |
|---------|----------------|
| **Redis** | `apes:client:{id}`, `apes:channel:{serverId}`, `apes:channel:ALL` |
| **MongoDB** | Database: `apes_cluster`, Collections: `clients`, `events` |
| **PostgreSQL** | Tables: `apes_clients`, Channel: `apes_events` |
| **Supabase** | Table: `apes_clients` (must create), Realtime channels |
| **Firebase** | Paths: `/apes/clients/*`, `/apes/channels/*` |

### Custom Adapters

For unsupported databases or testing, implement the adapter interface:

```js
ape.joinVia({
  async join(serverId) {
    // Subscribe to channels, register this server
  },
  
  async leave() {
    // Unsubscribe, cleanup client mappings
  },
  
  lookup: {
    async add(clientId) {
      // Map clientId → this server
    },
    async read(clientId) {
      // Return serverId or null
    },
    async remove(clientId) {
      // Delete mapping (must own it)
    }
  },
  
  channels: {
    async push(serverId, message) {
      // Send to server's channel ("" = broadcast)
    },
    async pull(serverId, handler) {
      // Subscribe to channel
      // handler(message, senderServerId)
      return async () => { /* unsubscribe */ };
    }
  }
});
```

### Lifecycle

| Event | What Happens |
|-------|-------------|
| **Server joins** | `join(serverId)` — subscribe to channels |
| **Client connects** | `lookup.add(clientId)` — register mapping |
| **Message to remote client** | `lookup.read()` → `channels.push()` |
| **Broadcast** | `channels.push('')` — to ALL channel |
| **Client disconnects** | `lookup.remove(clientId)` |
| **Server shuts down** | `leave()` — cleanup everything |

### Crash Recovery

`clientId` is ephemeral — generated fresh on each connection. If a server crashes:

1. Orphaned client mappings remain (stale)
2. Clients reconnect with new `clientId` to another server
3. New mappings are created; old ones are harmless
4. Optional: Use Redis `EXPIRE` or DB TTL indexes for cleanup

### Example: Multi-Server Chat

**Server A (port 3001):**
```js
const { ape } = require('api-ape');
const redis = createClient();
await redis.connect();

ape(server, { where: 'api' });
ape.joinVia(redis, { serverId: 'srv-a' });

server.listen(3001);
```

**Server B (port 3002):**
```js
const { ape } = require('api-ape');
const redis = createClient();
await redis.connect();

ape(server, { where: 'api' });
ape.joinVia(redis, { serverId: 'srv-b' });

server.listen(3002);
```

**Controller (`api/chat.js`):**
```js
module.exports = function(message) {
  // Broadcasts across ALL servers automatically
  this.broadcastOthers('chat', { 
    from: this.clientId, 
    message 
  });
  return { sent: true };
};
```

Now clients connected to different servers can chat with each other seamlessly.

### Performance Considerations

| Concern | Recommendation |
|---------|---------------|
| **Lookup latency** | Use Redis for sub-ms lookups |
| **Message throughput** | Redis PUB/SUB handles millions/sec |
| **Stale mappings** | Set TTL/EXPIRE on client keys |
| **Large payloads** | Postgres NOTIFY has 8KB limit |
| **Change Stream lag** | MongoDB may have slight delay |

### Debugging

Forest logs key operations:

```
🔌 APE: Detected redis adapter (serverId: X7K9MWPA)
✅ Redis adapter: joined as X7K9MWPA
📍 Redis adapter: registered client abc123 -> X7K9MWPA
📤 Redis adapter: pushed to server Y8M2ZPQR
📢 Redis adapter: broadcast to all servers
🔴 Redis adapter: leaving, cleaning up 3 clients
```

---

## Adapter Files

See detailed adapter implementations in [`server/adapters/`](adapters/):

| File | Description |
|------|-------------|
| `index.js` | Auto-detects database type, creates adapter |
| `redis.js` | Redis PUB/SUB adapter |
| `mongo.js` | MongoDB Change Streams adapter |
| `postgres.js` | PostgreSQL LISTEN/NOTIFY adapter |
| `supabase.js` | Supabase Realtime adapter |
| `firebase.js` | Firebase RTDB adapter |
| `README.md` | Quick reference for all adapters |

---

## Wire protocol

Everything is text frames over one WebSocket at `/{urlPrefix}/ape`, encoded with **JSS** (JSON plus `<!X>`-tagged keys for `Date`, `RegExp`, `Error`, `Set`, `Map`, `undefined` and circular references). Programs that are not api-ape clients (test probes, other languages) can speak it with the two published helpers:

```js
import jss from 'api-ape/jss'                 // stringify / parse / encode / decode
import messageHash from 'api-ape/messageHash' // queryId of a message
```

**Client to server**

| Frame | Meaning |
|-------|---------|
| `{ type, data, createdAt, requestedAt, nonce }` | A call to endpoint `type` (a leading `/` is ignored). `createdAt` must not be in the future or older than 10 s. The `queryId` is **`messageHash(<the exact text sent>)`** and must not repeat within 10 s on one socket (a repeat is refused as a replay), so identical calls need something that differs: the clients add a counter `nonce`. |
| `{ subscribe: '/channel' }` | Receive everything published to `/channel`; a new subscriber gets the last published message at once. |
| `{ unsubscribe: '/channel' }` | Stop. |

**Server to client**

| Frame | Meaning |
|-------|---------|
| `{ type: '__connected__', data: { clientId, sessionId } }` | First frame after the upgrade. Send `?resume=<clientId>` plus the `sessionId` cookie on a reconnect (see above). |
| `{ queryId, data }` | The reply to the call with that `queryId`. A controller that returns nothing gives `data` as `undefined` (encoded `"data<!U>": 0`). |
| `{ queryId, err, errCode?, errData? }` | The call failed. `err` is an `Error` (JSS keeps `name` and `message`; the stack is `"Name: message"` only; read with plain `JSON.parse` the key is `err<!E>` = `[name, message, stack]`); `errCode` / `errData` carry the `code` / `data` the controller attached, under the rules in [Errors](#errors) (a value thrown with no message, such as a plain object, arrives as itself without its own `stack`). Only the standard Error classes are rebuilt from an `err` tag; any other class name arrives as a plain `Error` carrying that name. The HTTP long-poll `POST` answers with this same frame (HTTP 500, or 404 for an unknown endpoint). |
| `{ queryId, _keepalive: true }` | `this.keepalive()` was called: the call is still running. Not a reply; restart the call's timer and wait for the real one. |
| `{ type: '/channel', data }` | A publish to a subscribed channel, or `this.send` / `this.broadcast` push (`type` is whatever the server named it). No `queryId`. |

Conformance of every row above is tested in `simulator/scenarios/stories/call-contract/wire-protocol.test.js`, written against `api-ape/jss` and `api-ape/messageHash`.

## Upgrading to 4.4.0

4.4.0 is a **security release**: use it, whatever else you read here (details in the [CHANGELOG](../CHANGELOG.md#security)). Things that can break an application, all listed under "Breaking" in the CHANGELOG:

- `ape()` / `apeBun()` **throw** if given `authFramework` or `authMiddleware` (they were never applied). Authenticate in `onConnect`.
- A controller file that exports something that is not a function **stops startup**, naming the file.
- `this.foo = x` in a controller is **private to that call**; keep per-connection state in `onConnect`'s `embed`.
- `online()` and `getClients()` are no longer in `index.d.ts` (use `this.clients`).
- Code that reads reply frames with plain `JSON.parse` sees the error as `err<!E>`, not a string `err`; read frames with `api-ape/jss`. The HTTP long-poll POST answers in the same shape.
- `err.code` / `err.data` are forwarded only for the errors you throw: own, plain, never from Node system errors (see [Errors](#errors)).

Old clients keep working against a 4.4.0 server (upgrade the server first), with the caveats under "Mixed versions" in the CHANGELOG.

## Troubleshooting & FAQ

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

Return `Buffer` data from controllers:

```js
// api/files/download.js
module.exports = function(filename) {
  return {
    name: filename,
    data: fs.readFileSync(`./uploads/${filename}`)  // Buffer
  }
}
```

Client receives `ArrayBuffer`:

```js
const result = await api.files.download('image.png')
const blob = new Blob([result.data])
img.src = URL.createObjectURL(blob)
```

### TypeScript Support

Type definitions are included (`index.d.ts`). For full type safety:
* Define interfaces for your controller parameters and return types
* Use type assertions when calling `api.<path>.<method>()`
