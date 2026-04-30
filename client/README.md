# 🦍 api-ape Client

![api-ape mascot](../assets/friend.jpg)

## Overview

The client module provides the browser-side WebSocket client for api-ape. It enables seamless communication with api-ape servers through a proxy-based API that converts method calls like `api.users.list()` into WebSocket messages.

**Key capabilities:**

- **Proxy-based API** — Call server endpoints like local methods (`api.path.method(data)`)
- **Auto-reconnection** — Automatically reconnects with exponential backoff on disconnection
- **Call buffering** — Queues calls made before connection is established
- **JSS encoding** — Supports Date, RegExp, Error, Set, Map, and undefined over the wire
- **HTTP fallback** — Falls back to long-polling when WebSocket is blocked
- **Binary transfers** — Transparent file upload/download handling
- **Connection state** — Track connection status (offline, connecting, connected, disconnected)
- **Pub/sub subscriptions** — Subscribe to channels and receive targeted updates

The client works in both browser environments (via `<script>` tag) and bundled applications (React, Vue, etc.).

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

### Browser (via script tag)

```html
<script src="/api/ape.js"></script>
<script>
  // Call server functions (RPC)
  api.hello('World').then(result => console.log(result))

  // Subscribe to channels (pass a callback function)
  const unsub = api.message(data => console.log(data))

  // Unsubscribe when done
  unsub()
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

// Subscribe to channels (pass a callback function)
const unsub = api.news.banking(data => {
  console.log('Received:', data)
})

// Unsubscribe when done
unsub()

// Track connection state
api.onConnectionChange((state) => {
  console.log('Connection:', state)
  // 'offline' | 'walled' | 'disconnected' | 'connecting' | 'connected'
})
```

**Connection States:**
- `offline` — Browser reports no network
- `walled` — Captive portal detected (WiFi without real internet)
- `disconnected` — Had connection, lost it
- `connecting` — Actively connecting
- `connected` — Ready to use
- `closing` — Connection is closing

**No async setup needed!** The client auto-initializes and buffers calls until connected.

## Transient network & logical reconnect (Phase 1)

WebSocket disconnects are expected in production (Wi‑Fi handoffs, laptop sleep, deploys). api-ape handles **queued but unsent** RPC by buffering until the transport is ready again; subscriptions are **re-sent** on connect (`resubscribeAll`).

**Stable logical client id (`clientId`)** — After `__connected__`, the browser keeps the server-issued `clientId` in memory and sends **`wss://…/api/ape?resume=<clientId>`** on the next WebSocket open so the server can re-bind the same logical row **within a short TTL** after disconnect. The server also sends **`sessionId`** in `__connected__`; the browser stores it as a **non-HttpOnly** `sessionId` cookie so upgrades carry a **second factor**. Reattach succeeds only when **`(sessionId, clientId)`** matches the row recorded at disconnect — a captured URL alone is not enough.

**Node (`server/client`)** — Handshake **`Cookie: sessionId=…`** (after the first `__connected__`) plus **`resume`** as a query parameter on the WS URL (mirrors the browser). Headers such as **`x-ape-session-id`** / **`x-ape-resume`** are accepted where cookies or query strings are awkward.

**Backoff** — Browser reconnect delay matches the Node client pattern (exponential cap 30s with jitter). Tune resume grace with **`APE_RESUME_TTL_MS`** (milliseconds; default 120000).

**In-flight RPC** — Responses for requests already **sent** may still be lost on disconnect (Phase 2 mailbox covers deeper guarantees). Pending browser RPC callbacks are **rejected on socket close** so callers fail fast instead of hanging.

**Dual transport (WebSocket vs HTTP fallback)** — While **polling/streaming** mode uses its own **`apeClientId`** cookie lifecycle, **logical WS resume** (`clientId` + `sessionId` pairing) applies when the active transport is WebSocket. Switching between transports does not automatically unify those identifiers; treat LP + WS as separate attachment surfaces until an explicit alignment ships.

## Framework logging

The browser client emits **internal** diagnostics in some cases (for example streaming fallback, dev-only ping checks on `localhost`, subscription callback errors, binary fetch progress). Application code you write is unaffected.

**Prefer configuring before the first RPC or subscription** so early messages respect the setting:

```js
import api, { configureApeLogging } from 'api-ape'

configureApeLogging(false) // or pass a custom { log, warn, error, ... } object

// Then use api as usual
await api.ping()
```

Equivalent accessors:

- `api.configureLogging(false)` — same function, exposed on the default export proxy.
- Low-level `connectSocket` (advanced): `connectSocket({ logging: false })` or `connectSocket.configureLogging(false)` from `api-ape/client` if you use that entry.

Semantics match the server: `false` silences internal framework logs; `true` or omit uses `console`; an object merges custom functions with `console` for missing levels.

See also: [Server README](../server/README.md#framework-logging) for `ape(server, { logging })`.

## Features

- **Proxy-based API** — `ape.path.method(data)` converts to WebSocket calls
- **Auto-reconnect** — Reconnects on disconnect with queued messages
- **Promise-based** — All calls return promises with matched responses via queryId
- **JSS encoding** — Supports Date, RegExp, Error, Set, Map, undefined over the wire
- **Request timeout** — Configurable timeout (default: 10s)

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

## Pub/Sub Subscriptions

Subscribe to channels using the same chaining syntax as RPC calls. The key difference: **pass a callback function to subscribe, pass data to make an RPC call**.

```js
// RPC call - passing data
await api.news.banking({ category: 'stocks' })  // Returns Promise<response>

// Subscribe - passing a callback function
const unsub = api.news.banking(data => {
  console.log('Received:', data)
})

// Unsubscribe when done
unsub()
```

### Chained Subscriptions

```js
// Subscribe to nested channels
const unsub1 = api.stock.AAPL(data => {
  console.log('AAPL:', data.price)
})

const unsub2 = api.health(data => {
  console.log('Health update:', data)
})

// Clean up
unsub1()
unsub2()
```

**Behavior:**
- On subscribe, you receive the last published message immediately (if any)
- Subscriptions are automatically restored on reconnect
- Subscriptions are automatically cleaned up on disconnect

## Security

### CSRF Protection

api-ape includes built-in **Cross-Site Request Forgery (CSRF)** protection:

- **Origin Validation** — WebSocket connections validate Origin header against Host
- **Automatic Rejection** — Mismatched origins are rejected immediately
- **Session Verification** — Binary transfers verify session cookies

No configuration needed — protection is enabled by default.
