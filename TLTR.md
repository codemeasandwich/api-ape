# api-ape Client — The Complete Tutorial

> A one-stop guide to `api-ape` on the browser: the proxy mental model, connection lifecycle, file transfer, and how to wire it cleanly into client-side stores (Redux, Zustand, useReducer) at the reducer level.

---

## 1. What api-ape gives you, in 30 seconds

`api-ape` is a single client object that does three jobs over one socket:

1. **RPC** — call any server endpoint as if it were a method: `await api.users.create({ name })`
2. **Pub/sub** — subscribe to channels by passing a callback: `const off = api.news.banking(d => …)`
3. **File ferry** — embed `Blob` / `ArrayBuffer` anywhere in a payload; the client splits, uploads, and rehydrates them transparently.

It auto-connects, auto-buffers calls made before connect, auto-reconnects, auto-resubscribes, and auto-falls-back from WebSocket to HTTP streaming when WebSocket is blocked.

```js
import api from 'api-ape'

const result = await api.greet({ name: 'World' })   // RPC
const off    = api.chat.lobby(msg => render(msg))    // subscription
api.onConnectionChange(state => banner(state))       // lifecycle
```

That is the whole user-facing surface. Everything below is detail on top of those three primitives.

---

## 2. Install and first call

### Install

```bash
npm install api-ape
```

### Browser (bundler — Vite, Webpack, Next.js, etc.)

```js
import api from 'api-ape'

api.ping().then(console.log)
```

That's it. There is no `connect()` to call. On first property access the client lazily imports `connectSocket`, opens a WebSocket to `ws[s]://<your-host>/api/ape`, and enables auto-reconnect. Any calls made before the socket is open are **buffered** and flushed on connect.

### Browser (script tag, no bundler)

The server hosts a built bundle at `/api/ape.js`:

```html
<script src="/api/ape.js"></script>
<script>
  api.message({ user: 'me', text: 'hello' })
</script>
```

### SSR safety

When `window` / `document` are missing (Next.js server render, etc.), the default export becomes a dummy proxy: every call returns a Promise that resolves once the client hydrates in the browser. **You do not need to guard imports** — but see §11 for the patterns that actually work in practice.

---

## 3. The proxy mental model

`api` is a `Proxy`. Property access builds a path; calling sends a request. **What you pass decides what happens**:

| Call shape                              | Becomes                                    | Returns                       |
| --------------------------------------- | ------------------------------------------ | ----------------------------- |
| `api.foo(data)`                         | RPC to `/foo` with body `data`             | `Promise<response>`           |
| `api.foo.bar(data)`                     | RPC to `/foo/bar`                          | `Promise<response>`           |
| `api.foo('/123', data)`                 | RPC to `/foo/123` (two-arg path-suffix)    | `Promise<response>`           |
| `api.foo()`                             | RPC to `/foo` with no body                 | `Promise<response>`           |
| `api.foo(callback)` *(arg is fn)*       | **Subscribe** to channel `/foo`            | `() => void` (unsubscribe)    |
| `api.foo.bar(callback)`                 | **Subscribe** to `/foo/bar`                | `() => void`                  |

### Reserved keys (these don't build paths)

- `api.on(type, handler)` — `type`-filtered receiver (see §6)
- `api.onConnectionChange(handler)` — connection-state listener (see §7)
- `api.configureLogging(option)` — control framework logs (see §10)
- `api.transport` — read-only: `'websocket' | 'polling' | null`

Anything else becomes a path segment. Pick endpoint names that won't collide.

### The "function arg = subscription" rule

Subscriptions are inferred purely from **the type of the single argument**:

```js
api.users(data)     // RPC      — data is anything except a function
api.users(callback) // SUBSCRIBE — exactly one arg, and it is a function
```

If you ever need to send a function-shaped payload (you don't, JSON can't carry it) you'd be stuck — but in practice this disambiguation is fine.

---

## 4. RPC calls

```js
// Fire and forget (don't do this — see lazy-timeout below)
api.metrics.beacon({ event: 'page-view' })

// Await response
const user = await api.users.get({ id: 42 })

// With error handling
try {
  await api.payments.charge({ amount, currency })
} catch (err) {
  // err is the server-thrown error string, or a timeout/disconnect error
}

// Path suffix (e.g. resource id)
const profile = await api.users(`/${userId}/profile`)
```

### Lazy timeout — the #1 gotcha

Internally each RPC starts a timer **only when you attach `.then` / `.catch` / `await`**. If you fire-and-forget, no timeout will ever fire — the message either gets sent on connect or sits in the queue forever.

```js
api.metrics.beacon({ … })          // ❌ no timeout — silent if server never replies
api.metrics.beacon({ … }).catch(noop)  // ✅ timeout active, errors swallowed by you
```

**Default timeouts**: ~10 s total request, ~5 s connect window. If the connection isn't up in time, the queued send rejects.

### What the response looks like

The Promise resolves with whatever the server controller returns. Errors thrown on the server come back as rejected Promises whose error message is the server message. JSS encoding round-trips `Date`, `RegExp`, `Map`, `Set`, `Error`, `undefined`, and circular references — you don't need to JSON-stringify by hand.

---

## 5. Subscriptions

```js
const off = api.chat.lobby((msg) => {
  console.log('new message:', msg)
})

// later
off()
```

Things that are true:

- **Idempotent unsubscribe** — calling `off()` twice is safe.
- **Reconnect-safe** — on reconnection, the client resubscribes to every active channel automatically. You don't write retry logic.
- **Multi-listener-friendly** — multiple subscribers to the same channel share one server subscription. The client only sends `unsubscribe` when the last listener leaves.
- **Errors in callbacks are swallowed** — if your callback throws, it is caught and logged; the channel keeps delivering. Don't rely on a thrown error to bubble up — if you need that, do it yourself.

Subscription callbacks receive **just the data payload** the server published. (Compare with `api.on`, which gets the wrapped `{err, type, data}` envelope — see §6.)

---

## 6. `api.on(type, handler)` vs callback subscriptions

There are two ways to listen, and they are subtly different:

```ts
// (a) Channel subscription — for pub/sub channels you explicitly subscribe to
const off = api.chat.lobby((data) => …)

// (b) api.on — type-filtered receiver for any inbound message of that type
api.on('init', ({ err, type, data }) => …)
api.on('chat.lobby', ({ err, type, data }) => …)
```

### When to use which

- **Use `api.foo(cb)`** for *named channels you actively subscribe to*. The client tracks the subscription and resubscribes after a reconnect.
- **Use `api.on(type, handler)`** when the server pushes a typed message you want to receive but didn't subscribe to as a channel — e.g. server-initiated `'init'` payloads, presence pings, anything broadcast to all clients.

### Payload shape

| Pattern               | Callback receives                |
| --------------------- | -------------------------------- |
| `api.foo(cb)`         | `cb(data)` — raw data            |
| `api.on(type, h)`     | `h({ err, type, data })` envelope |

This catches people out. Pick one style per channel and stick with it across your codebase.

---

## 7. Connection lifecycle

Six states, exposed verbatim:

```
'offline'      → navigator.onLine === false (browser unplugged)
'walled'       → captive portal detected (hotel/airport WiFi)
'connecting'   → handshake in progress
'connected'    → ready
'disconnected' → was connected, link dropped (auto-reconnect will retry)
'closing'      → graceful shutdown
```

### Subscribing to changes

```js
const off = api.onConnectionChange((state) => {
  if (state === 'connected')   showOnline()
  else if (state === 'walled') showCaptivePortalBanner()
  else                          showOffline()
})
// off()  // unsubscribe
```

Important behaviors:

- The handler is called **immediately** on registration with the current state. You don't need to read state separately.
- `onConnectionChange` returns an **unsubscribe function**. Always call it on cleanup.
- `'walled'` is a real state and a real UX concern — the client pings `/api/ape/ping` and validates the timestamp; a captive-portal redirect serves an HTML page instead, and that's how `'walled'` is detected. Treat it as "offline-ish" but with an actionable banner ("Sign in to this network").

---

## 8. Transports

The client tries WebSocket first; if no upgrade response arrives within ~4 s, it falls back to **HTTP streaming** (chunked long-poll on `GET /api/ape/poll`). From polling mode it keeps trying to upgrade to WebSocket every ~30 s.

```js
api.transport            // 'websocket' | 'polling' | null
```

### What this means for you

- **Don't assume WebSocket** is available. Hostile networks, corporate proxies, and old load balancers strip the upgrade.
- Use `api.transport` to surface a **degraded-mode UX**: "Slow connection mode" banner when `polling`, normal when `websocket`.
- Latency is higher on polling. Subscriptions still work. Big binary uploads still work (they go over HTTP either way).

---

## 9. File transfer

You can put a `Blob`, `ArrayBuffer`, or `TypedArray` **anywhere inside a payload**. The client tags the location, uploads the binary out-of-band over HTTP, and the server controller receives a normal object with the binaries reattached. The reverse works too — server-sent binaries arrive as `ArrayBuffer` in your handler.

### Upload

```js
const file = await fileInput.files[0].arrayBuffer()
await api.documents.upload({
  title: 'Q4 report',
  body: file,                // ← binary anywhere is fine
  attachments: [{ name: 'chart.png', data: chartBlob }],
})
```

Mechanics (you don't need to handle them, but knowing helps):

- Binaries get a JSS tag in the JSON envelope: `<!A>` (ArrayBuffer/TypedArray) or `<!B>` (Blob).
- Each binary is `PUT`'d to `/api/ape/data/{queryId}/{hash}` after the JSON envelope is sent.

### Download

When a server controller returns or publishes a payload containing binaries, you get them back as `ArrayBuffer` at the same key in the response — the wire tags `<!L>` (server-hosted) and `<!F>` (peer-shared, with built-in retry/backoff for "sender hasn't uploaded yet") are unwrapped for you.

```js
const { image } = await api.thumbs.get({ id })
//   image is an ArrayBuffer
const blob = new Blob([image], { type: 'image/png' })
const url  = URL.createObjectURL(blob)
```

Don't forget to `URL.revokeObjectURL(url)` when you're done — and do **not** store raw `ArrayBuffer`s in Redux/Zustand (see §15).

---

## 10. Configuration and logging

```js
api.configureLogging(false)          // silence all framework logs
api.configureLogging(true)           // use console (default)
api.configureLogging({ log: noop, warn: console.warn, error: console.error })
```

- Call it **before** your first RPC if possible. It's safe to call later but you may miss boot-time logs.
- Same effect as the named export `configureApeLogging` from `api-ape`.

Useful environment toggles you may see in repo code:

- `APIAPE_PUBSUB_LOG` — gate the per-publish log line on the server side; not a client switch but worth knowing for debugging round-trips.

---

## 11. Server-side rendering (Next.js, Remix, etc.)

The default export checks `typeof window` on import. On the server it returns a **dummy** that swallows calls without errors. That's nice — but it also means **`api` calls in server code do nothing**. Two rules:

1. **Don't call `api` from `getServerSideProps`, route handlers, or middleware.** Use a normal `fetch` or your server client.
2. **Don't `export const data = await api.x()` at module top level.** With React Server Components or any module evaluated server-side, you'll silently no-op on the server and *also* fire on the client at unpredictable times.

The pattern that works:

```tsx
// app/page.tsx (client component)
'use client'
import { useEffect } from 'react'
import api from 'api-ape'

export default function Page() {
  useEffect(() => {
    let cancelled = false
    api.feed.list().then(d => { if (!cancelled) setFeed(d) })
    return () => { cancelled = true }
  }, [])
}
```

---

## 12. Store integration — the heart of the matter

You asked specifically about leveraging api-ape from **client-side store-level reducers**. Here's the philosophy first, then three worked examples.

### The "thin sink, thick reducer" pattern

Components must not own subscriptions or RPCs directly. Components dispatch intents; a single **bridge layer** (middleware / store action / hook) translates intents into `api` calls and translates incoming server messages into dispatched actions. Reducers stay pure.

```
component → dispatch(intent)
              │
              ▼
     bridge / middleware ─────→ api.x(payload)         (RPC out)
              ▲                       │
              │                       ▼
        api.foo(cb) ←──────────  server push           (event in)
              │
              ▼
     dispatch(serverEvent)
              │
              ▼
          reducer (pure)
              │
              ▼
            state → component
```

This gives you: one client per tab, central retry/cleanup, testable reducers, no leaks, and reconnect-aware refetches in one place.

---

### 12a. Redux Toolkit — worked example

`store/apeMiddleware.js`:

```js
import api from 'api-ape'

const subscriptions = new Map() // channel → unsubscribe

export const apeMiddleware = (store) => {
  // Connection state → store
  api.onConnectionChange((state) => {
    store.dispatch({ type: 'ape/connectionChanged', payload: state })
  })

  return (next) => (action) => {
    switch (action.type) {
      case 'ape/subscribe': {
        const { channel } = action.payload
        if (subscriptions.has(channel)) break
        const off = api[channel.replace(/^\//, '').replace(/\//g, '.')](
          (data) => store.dispatch({
            type: `ape/event/${channel}`,
            payload: data,
          })
        )
        subscriptions.set(channel, off)
        break
      }
      case 'ape/unsubscribe': {
        const off = subscriptions.get(action.payload.channel)
        if (off) { off(); subscriptions.delete(action.payload.channel) }
        break
      }
    }
    return next(action)
  }
}
```

`store/chatSlice.js`:

```js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from 'api-ape'

export const sendMessage = createAsyncThunk(
  'chat/send',
  async ({ room, text }, { rejectWithValue }) => {
    try { return await api.chat.send({ room, text }) }
    catch (err) { return rejectWithValue(String(err)) }
  }
)

const slice = createSlice({
  name: 'chat',
  initialState: { messages: [], status: 'idle', connection: 'disconnected' },
  reducers: {},
  extraReducers: (b) => {
    b.addCase('ape/connectionChanged', (s, a) => { s.connection = a.payload })
    b.addCase('ape/event//chat/lobby', (s, a) => { s.messages.push(a.payload) })
    b.addCase(sendMessage.pending,   (s) => { s.status = 'sending' })
    b.addCase(sendMessage.fulfilled, (s) => { s.status = 'idle' })
    b.addCase(sendMessage.rejected,  (s) => { s.status = 'error' })
  },
})

export default slice.reducer
```

Mounting & cleanup (in your root component):

```js
useEffect(() => {
  dispatch({ type: 'ape/subscribe',   payload: { channel: '/chat/lobby' } })
  return () => dispatch({ type: 'ape/unsubscribe', payload: { channel: '/chat/lobby' } })
}, [dispatch])
```

Why this is good: reducer is pure, the middleware is the only place that knows about `api`, every channel/event is a dispatched action you can log/replay/test.

---

### 12b. Zustand — worked example

```js
import { create } from 'zustand'
import api from 'api-ape'

const subs = new Map()

export const useApeStore = create((set, get) => ({
  connection: 'disconnected',
  data:       {},
  status:     {},

  init: () => {
    api.onConnectionChange((state) => set({ connection: state }))
  },

  rpc: async (path, payload) => {
    const key = path
    set((s) => ({ status: { ...s.status, [key]: 'pending' } }))
    try {
      const segs = path.replace(/^\//, '').split('/')
      const fn = segs.reduce((a, k) => a[k], api)
      const result = await fn(payload)
      set((s) => ({
        data:   { ...s.data,   [key]: result },
        status: { ...s.status, [key]: 'idle' },
      }))
      return result
    } catch (err) {
      set((s) => ({ status: { ...s.status, [key]: 'error' } }))
      throw err
    }
  },

  subscribe: (channel) => {
    if (subs.has(channel)) return
    const segs = channel.replace(/^\//, '').split('/')
    const fn = segs.reduce((a, k) => a[k], api)
    const off = fn((event) => {
      set((s) => ({
        data: { ...s.data, [channel]: event },
      }))
    })
    subs.set(channel, off)
  },

  unsubscribe: (channel) => {
    const off = subs.get(channel)
    if (off) { off(); subs.delete(channel) }
  },
}))

// at app boot:
useApeStore.getState().init()
```

Components:

```jsx
function Lobby() {
  const subscribe   = useApeStore(s => s.subscribe)
  const unsubscribe = useApeStore(s => s.unsubscribe)
  const event       = useApeStore(s => s.data['/chat/lobby'])

  useEffect(() => {
    subscribe('/chat/lobby')
    return () => unsubscribe('/chat/lobby')
  }, [subscribe, unsubscribe])

  return <Messages event={event} />
}
```

---

### 12c. React `useReducer` + Context — worked example (small apps)

```jsx
import api from 'api-ape'
import { createContext, useContext, useEffect, useReducer } from 'react'

const initial = { connection: 'disconnected', messages: [] }

function reducer(state, action) {
  switch (action.type) {
    case 'connection': return { ...state, connection: action.state }
    case 'message':    return { ...state, messages: [...state.messages, action.msg] }
    case 'reset':      return { ...state, messages: [] }
    default:           return state
  }
}

const Ctx = createContext(null)

export function ApeProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)

  useEffect(() => {
    const offState = api.onConnectionChange(s =>
      dispatch({ type: 'connection', state: s })
    )
    const offChan  = api.chat.lobby(msg =>
      dispatch({ type: 'message', msg })
    )
    return () => { offState(); offChan() }
  }, [])

  const send = (text) => api.chat.send({ text })

  return <Ctx.Provider value={{ state, send }}>{children}</Ctx.Provider>
}

export const useApe = () => useContext(Ctx)
```

---

### Selector hygiene & cleanup discipline

- **Normalize on the way in.** Store `{ byId, ids }`, not raw arrays of payloads. It pays dividends the moment subscriptions and RPCs both edit the same list.
- **Never store raw `ArrayBuffer`/`Blob` in your store.** Convert to `URL.createObjectURL` + a tiny ref-counted blob cache, store the URL string, and revoke when refcount hits zero.
- **Always return the unsubscribe** from `useEffect`. In React StrictMode the effect runs twice on mount; not returning the unsubscriber leaks subscribers.
- **Reset on reconnect when needed.** A reducer can listen for `connection === 'connected'` and request a fresh snapshot via RPC — the cleanest way to handle "I missed events while disconnected".

```js
// reducer fragment
case 'connection':
  if (action.state === 'connected') {
    api.feed.snapshot().then(snap =>
      dispatchOuter({ type: 'feed/snapshot', snap }))
  }
  return { ...state, connection: action.state }
```

---

## 13. Common patterns

### Optimistic update with rollback

```js
function send(text) {
  const tmpId = crypto.randomUUID()
  dispatch({ type: 'add', msg: { id: tmpId, text, pending: true } })
  api.chat.send({ text }).then(
    saved  => dispatch({ type: 'confirm', tmpId, saved }),
    err    => dispatch({ type: 'rollback', tmpId, err: String(err) }),
  )
}
```

### Channel-driven list sync

Subscribe once, treat events as deltas, never re-fetch on each event. On reconnect, fetch a snapshot and reconcile.

### Presence

```js
api.presence.online(setOnlineUsers)            // subscription
api.presence.heartbeat({ at: Date.now() })     // periodic RPC
```

### Room-scoped subscriptions

Use the two-arg path-suffix form so a single endpoint name covers many rooms:

```js
const off = api.rooms(`/${roomId}/messages`, msg => …)
```

(Yes — channel subscriptions support the suffix form too. Anything that returns an `ApeSender` does.)

### Debounced server search

```js
const [q, setQ] = useState('')
useEffect(() => {
  const id = setTimeout(() => api.search({ q }).then(setResults), 200)
  return () => clearTimeout(id)
}, [q])
```

### Cursor pagination

```js
async function loadMore() {
  const page = await api.feed.list({ cursor })
  setCursor(page.next)
  setItems(prev => [...prev, ...page.items])
}
```

### Reconnect-aware refetch

Centralize this — subscribe once at the bridge layer to `onConnectionChange`, dispatch a "reconnected" action, let each slice opt in via `extraReducers`.

---

## 14. Best practices (do these)

- **Single client per tab.** Use the default export — let it auto-init. Never create more than one connection.
- **Gate writes on `'connected'`.** Buffering exists for boot, not for arbitrary offline periods. Show a UI affordance and skip writes when not connected.
- **Treat `'walled'` as offline-with-an-action.** Show a "Sign in to this network" banner.
- **`await` RPCs you care about.** Otherwise the lazy-timeout will not fire (§4).
- **Type your endpoints.** The TS types use generics — `api.users.create<{name:string},{id:string}>({name})` lets the response be `Promise<{id:string}>`.
- **Centralize your `api` access** in a bridge (middleware / store action / context). One place to refactor when the contract changes.
- **Normalize server data** before it lands in your store.
- **Always return the unsubscribe** from any effect that subscribes.

## 15. Anti-patterns (don't do these)

- ❌ **Don't open your own `connectSocket()` per component.** It works, but you'll spawn N sockets, race subscriptions, and make timeouts inconsistent.
- ❌ **Don't fire-and-forget RPCs you need acknowledged.** No `.then`/`await` ⇒ no timeout ⇒ no error path.
- ❌ **Don't store `ArrayBuffer`/`Blob` directly in Redux or Zustand.** They're not serializable, they're huge, and your devtools will choke. Convert to object URLs and store the URL.
- ❌ **Don't subscribe in render bodies.** Subscribe in effects. Component renders happen many times; subscriptions must be set up once and torn down once.
- ❌ **Don't assume order between `onConnectionChange('connected')` and your first subscription event.** They're independent. If you need "subscribe ⇒ confirmed ⇒ event", use an RPC that returns confirmation, then subscribe.
- ❌ **Don't re-export `api` from a file that also runs on the server.** It'll dummy-out there and confuse you when calls "vanish". Keep `api` imports in client-only code paths.
- ❌ **Don't manually retry on disconnect.** The client already does it; you'll double up.
- ❌ **Don't put logic in subscription callbacks that throws on bad input.** Errors get swallowed and logged; the channel keeps delivering. Validate, branch, and dispatch instead.

---

## 16. Tips & tricks

- **Mirror your folder structure in endpoint names.** If your server controllers live at `controllers/users/create.js`, the client call is `api.users.create(…)`. This makes greps trivial.
- **Use the two-arg path suffix for resource IDs**:  `api.users('/'+id)` is cleaner than building strings inside a path segment.
- **Surface "degraded mode"** when `api.transport === 'polling'` — a small "Slow mode" badge prevents support tickets.
- **Captive-portal banner**: when `state === 'walled'`, show a button that opens `http://neverssl.com` (or your own portal-trigger URL) in a new tab — most OSes will pop the captive-portal sign-in.
- **Drain logs in production**: `api.configureLogging({ log: () => {}, warn: console.warn, error: Sentry.captureException })`.
- **Unit-test reducers without the network.** Because `api` lives in middleware, your reducers are pure — just dispatch the actions a real connection would.
- **Test integration with the simulator harness** in this repo (`simulator/harness/`) — it boots a real api-ape server and a fake client without needing browser plumbing.
- **Idempotent unsubscribes.** Calling `off()` more than once is safe — useful when both an effect cleanup and a manual "leave room" button can fire.

---

## 17. Quick reference cheatsheet

```ts
// Default export
import api from 'api-ape'

// RPC
const r = await api.path.nested(payload)             // /path/nested
const r = await api.users('/'+id)                    // /users/{id}
const r = await api.users('/'+id, payload)           // /users/{id} + body

// Subscriptions  (single function arg)
const off = api.channel.name(data => …)              // returns unsubscribe
const off = api.rooms('/'+id, msg => …)              // path suffix works too

// Type-filtered receiver
api.on('init',    ({err, type, data}) => …)
api.on('chat',    ({err, type, data}) => …)

// Connection state
const off = api.onConnectionChange(state => …)
//   state: 'offline' | 'walled' | 'disconnected' | 'connecting' | 'connected' | 'closing'

// Logging
api.configureLogging(false)
api.configureLogging({ log, warn, error, info, debug })

// Transport introspection
api.transport     // 'websocket' | 'polling' | null

// Lower-level (rarely needed)
import connectSocket from 'api-ape/client/connectSocket'
const { sender, setOnReceiver, onConnectionChange, transport } = connectSocket()
connectSocket.autoReconnect()
connectSocket.configureLogging(false)
connectSocket.ConnectionState   // enum object

// Files
await api.documents.upload({ title, body: arrayBuffer, attach: blob })
const { image } = await api.thumbs.get({ id })   // image is ArrayBuffer
```

That's the whole client. Build outward from §3 (the proxy mental model), put `api` behind a bridge (§12), and keep reducers pure.
