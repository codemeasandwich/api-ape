# api-ape: Best Practices & Common Pitfalls

## Context

This document is the deliverable — a deep-dive synthesis of the api-ape documentation and source, with a deliberate focus on how to stream server-originated events to connected clients **without** adding a client-initiated "register for stream X" RPC endpoint. That pattern is an anti-pattern in api-ape's model because the framework already provides two first-class push primitives (channel pub/sub and direct `client.send`) that are stateful, reconnect-safe, and do not require a round-trip to opt in.

Findings are grounded in direct reads of the source (not just the prose docs) and flag a few places where the README disagrees with the implementation. Every claim below is backed by a file:line reference.

---

## 1. The mental model (read this first)

api-ape is **Remote Procedure Events (RPE)**. A client proxy (`api.foo.bar(...)`) converts property access into either:

- **RPC** — if you pass data (or nothing), a correlated request/response round-trip.
- **Subscription** — if you pass a **callback function**, a stateful subscription to a server-side pub/sub channel.

The distinction is made by argument type on the client, at [client/index.js](../../SOURCE/api-ape/client/index.js) and the proxy at [client/connection/proxy.js](../../SOURCE/api-ape/client/connection/proxy.js). From [client/README.md:142-156](../../SOURCE/api-ape/client/README.md#L142-L156):

> "Pass a callback function to subscribe, pass data to make an RPC call."

There are **three** server push mechanisms, not one. They are not interchangeable — pick the one that matches the fan-out shape of the event:

| Mechanism | Fan-out | Server API | How client receives |
|---|---|---|---|
| **`this.publish(channel, data)` / `ape.publish.channel(data)`** | 0..N subscribers of a named channel | [server/lib/broadcast/pubsub.js:121](../../SOURCE/api-ape/server/lib/broadcast/pubsub.js#L121) | `api.channel(cb)` subscription callback |
| **`client.send(type, data)`** (where `client = ape.clients.get(id)` or an entry from `this.clients`) | Exactly one specific client | [server/lib/broadcast/clients.js:80-92](../../SOURCE/api-ape/server/lib/broadcast/clients.js#L80-L92) → [server/socket/send.js:396-507](../../SOURCE/api-ape/server/socket/send.js#L396-L507) | `api.on(type, handler)` or the generic receiver |
| **Iterate + send** (`this.clients.forEach(c => c.send(...))`) | All / filtered set of currently-connected clients | Manual loop | Same as above |

**Key invariant:** clients are tracked as soon as the socket is accepted ([server/lib/wiring.js:400](../../SOURCE/api-ape/server/lib/wiring.js#L400)). You do **not** need, and should not add, a controller that says "register me for events." The connection itself is the registration.

---

## 2. Streaming without a dedicated register endpoint — the three idioms

### Idiom A — Channel pub/sub (the default; use this unless you can't)

**When:** any event that is logically a "topic" — prices, presence, notifications, job progress for a known job id, etc.

**Server:**

```js
// Anywhere on the server — inside a controller, an HTTP handler,
// a cron, a queue worker, a Redis consumer, etc.
const { ape } = require('api-ape')

// Chained (preferred — intent is visible):
ape.publish.stock.AAPL({ price: 185.50, change: 2.3 })

// Or path-string form:
ape.publish('/stock/AAPL', { price: 185.50, change: 2.3 })
```

Inside a controller you can also use `this.publish(channel, data)` — see [server/socket/receiveContext.js:41](../../SOURCE/api-ape/server/socket/receiveContext.js#L41).

**Client:**

```js
const unsub = api.stock.AAPL(data => { /* ... */ })
// later
unsub()
```

**Why this is the zero-register pattern:**

1. The client sends `{ subscribe: '/stock/AAPL' }` as a framed socket message, not as an RPC call. Handled at [server/socket/receive.js:63-74](../../SOURCE/api-ape/server/socket/receive.js#L63-L74). There is no controller file, no route, nothing for you to write — the transport layer itself owns this.
2. New subscribers are delivered the **last published message on that channel immediately** ([server/lib/broadcast/pubsub.js:83-85](../../SOURCE/api-ape/server/lib/broadcast/pubsub.js#L83-L85)). This is the feature that makes "register endpoint" patterns redundant — late joiners catch up without asking.
3. On reconnect the client re-issues `subscribe` for every live subscription automatically ([client/connection/subscriptions.js:129-137](../../SOURCE/api-ape/client/connection/subscriptions.js#L129-L137)). A hand-rolled register RPC would not survive reconnects without extra bookkeeping.
4. On disconnect the server tears down subscriptions via `cleanupClientSubscriptions(clientId)` ([server/lib/broadcast/pubsub.js:149-163](../../SOURCE/api-ape/server/lib/broadcast/pubsub.js#L149-L163)). No leaks.

### Idiom B — Direct 1:1 via `ape.clients.get(clientId).send(...)`

**When:** the event is for a **single** identified client (e.g., "finish uploading this file to user X", "ack for the command you just queued").

**Server — from an async context (timer, queue, HTTP handler):**

```js
const { ape } = require('api-ape')

const client = ape.clients.get(clientId)
if (client) {
  client.send('notification', { title: 'Your report is ready' })
  // or chained:
  client.send.notification.ready({ reportId: 'r_123' })
}
```

**Server — from inside a controller responding to a different client's call:**

```js
// api/admin/kick.js
module.exports = function ({ targetClientId, reason }) {
  const target = this.clients.get(targetClientId)
  if (target) target.send('kick', { reason })
  return { ok: Boolean(target) }
}
```

`ape.clients` is a **read-only proxy over the internal Map** ([server/lib/broadcast/clients.js:102-127](../../SOURCE/api-ape/server/lib/broadcast/clients.js#L102-L127)) — `.set`, `.delete`, `.clear` throw. You get `.get`, `.size`, `.forEach`, `.values`, `.entries`, `.keys`.

### Idiom C — Fan-out by iteration (`this.clients.forEach`)

**When:** you want to send to a dynamically-computed subset of connections (by room, by tenant, by authState, by presence of an embed field), and there is no natural channel for it.

```js
// api/room/send.js
module.exports = function ({ roomId, text }) {
  this.clients.forEach(client => {
    if (client.embed?.roomId === roomId && client.clientId !== this.clientId) {
      client.send('room:message', { text, from: this.clientId })
    }
  })
  return { ok: true }
}
```

Note `client.embed` — these are the values returned from `onConnect` and stored on the wrapper. That's how you carry per-connection attributes (user id, room id, tenant id) without state in a database.

---

## 3. Why "register for stream X" is an anti-pattern here

If you write a controller like:

```js
// api/notifications/register.js  ← DO NOT DO THIS
module.exports = function () {
  registry[this.clientId] = true          // manual tracking
  return { ok: true }
}
```

…you have reinvented, worse, three things the framework already does:

1. **Registration.** The `ape.clients` Map already holds every live connection. Iterate or look up; don't maintain a parallel registry.
2. **Delivery.** `client.send` and `ape.publish` are the delivery primitives. A `register` handler does not push anything; it is a pre-step before a push that never needs to happen.
3. **Reconnect resilience.** A manual registry is wiped on server restart, is not automatically replayed by the client, and has no "last message" replay. Channels have all three, for free.

There is also a **subtle correctness trap**: a `register` RPC is a one-shot Promise that resolves and is garbage-collected. The client has no live handle that the framework can use to deliver future events back. So the only way to make the pattern work is to *also* use `client.send` or `publish` behind the scenes — meaning the `register` step is pure overhead. Any data you would have validated in `register` (auth tier, scope) can be checked at publish/send time or gated via `onConnect`'s `embed`.

**One legitimate exception:** when the client wants to subscribe to a **dynamic channel name that depends on server-computed state** (e.g., "the channel for *my* job, whose id I don't know yet"). The clean pattern there is: client calls an RPC that returns the channel name, then subscribes to it. The RPC is not "register" — it's "give me the handle." But even this is usually avoidable: make the channel name derivable from something the client already has (userId, sessionId) and encode authorization server-side.

---

## 4. Server → client push — the exact code path

Worth knowing because it explains several pitfalls below.

```
Your code:  ape.publish.channel(data)
         ↓  publishProxy chain collapses to publish('/channel', data)
publish:    _lastMessages.set(channel, data)                        ← stored for late joiners
         ↓  for each subscriber clientId
wrapper:    _clients.get(clientId).send(channel, data)
         ↓  sendProxy → createSendProxy closure
socket:     socketSend(ape) → send(queryId=false, type, data, err=false, _keepalive)
         ↓  JSS-stringify { data, type, queryId }
wire:       socket.send(...) or HTTP-streaming chunk
```

Files in order:
[server/lib/broadcast/publishProxy.js:98-110](../../SOURCE/api-ape/server/lib/broadcast/publishProxy.js#L98-L110) →
[server/lib/broadcast/pubsub.js:121](../../SOURCE/api-ape/server/lib/broadcast/pubsub.js#L121) →
[server/lib/broadcast/clients.js:80](../../SOURCE/api-ape/server/lib/broadcast/clients.js#L80) →
[server/socket/send.js:396](../../SOURCE/api-ape/server/socket/send.js#L396).

Two important properties fall out of this:

- **Absent `queryId`** means the message is push (subscription or direct send); **present `queryId`** means it's an RPC reply. The client routes on this at [client/connection/messageHandler.js:72-81](../../SOURCE/api-ape/client/connection/messageHandler.js#L72-L81). Don't fight this — let push messages have no queryId.
- **Encoding is JSS, not JSON.** Date, RegExp, Error, Set, Map, and `undefined` round-trip. Don't pre-stringify your payloads.

---

## 5. Connection lifecycle — what's safe when

This sequence from [server/lib/wiring.js:303-568](../../SOURCE/api-ape/server/lib/wiring.js#L303-L568) is load-bearing:

1. Socket upgrades → `clientId` is generated (Crockford Base32, 20 chars, [server/utils/genId.js](../../SOURCE/api-ape/server/utils/genId.js)).
2. Client is added to the `ape.clients` Map **before `onConnect` returns** ([server/lib/wiring.js:400](../../SOURCE/api-ape/server/lib/wiring.js#L400)).
3. `send` is still **undefined** at this point — any early call is buffered into `sentBufferAr` ([server/lib/wiring.js:331-348](../../SOURCE/api-ape/server/lib/wiring.js#L331-L348)).
4. After `onConnect` resolves and security checks pass, the real `send` is bound and the buffer is flushed ([server/lib/wiring.js:505-555](../../SOURCE/api-ape/server/lib/wiring.js#L505-L555)).

**Practical consequences:**

- You can safely `ape.clients.get(clientId).send(...)` from *any* async code path, including during `onConnect` itself — the buffer protects you.
- `onConnect` is the right place to attach per-client attributes via the returned `embed` object. They become `client.embed.*` and are also spread onto `this` in controllers.
- `clientId` is **ephemeral per connection**, not per user or per session. A reconnect gets a new `clientId`. Never persist it. If you need continuity across reconnects, use `sessionId` (from cookies) or an authenticated `principal.userId`.

---

## 6. Best practices (ranked by blast radius)

### Tier 1 — will break things if violated

1. **Don't write a "register" controller.** Use `ape.publish` + channel subscription or `ape.clients.get().send`. See §3.
2. **Never persist `clientId` across reconnects.** Use `sessionId` or an authenticated id. `clientId` is regenerated per socket.
3. **Don't assume `broadcast` / `broadcastOthers` exist on `this`.** Despite [README.md:75 and :109](../../SOURCE/api-ape/README.md#L75) showing `this.broadcastOthers('message', ...)`, the actual controller context at [server/socket/receiveContext.js:37-45](../../SOURCE/api-ape/server/socket/receiveContext.js#L37-L45) exposes only `publish`, `clients`, `clientId`, `sessionId`, plus auth. **`this.broadcast(...)` will throw `is not a function`.** Replace with either `this.publish('message', {...})` (if it's a channel) or:
   ```js
   this.clients.forEach(c => {
     if (c.clientId !== this.clientId) c.send('message', data)
   })
   ```
4. **Don't place both `api/users.js` and `api/users/index.js`.** Startup error: "Duplicate endpoint detected" — [server/README.md:199](../../SOURCE/api-ape/server/README.md#L199).
5. **Don't skip `await ape.leaveCluster()` on SIGINT** when using Forest. Orphan `clientId → serverId` mappings will route messages to dead servers. See [server/README.md:542](../../SOURCE/api-ape/server/README.md#L542).

### Tier 2 — will cause subtle bugs

6. **Prefer `publish` over `clients.forEach` whenever the event is topical.** Pub/sub gets you (a) last-message replay, (b) automatic reconnect re-subscribe, (c) O(subscribers) not O(clients).
7. **Pass a *stable* channel name.** `ape.publish.stock.AAPL({...})` — not `ape.publish.stock[Date.now()]({...})`. Channel identity *is* the subscription key.
8. **Scope authorization at publish/send time, not at subscribe time.** The subscribe handler at [server/socket/receive.js:63-74](../../SOURCE/api-ape/server/socket/receive.js#L63-L74) accepts any channel name. If a channel is sensitive, either (a) namespace it with something the client can't forge (`/user/${principal.userId}/inbox` where `principal.userId` is known server-side and used at publish time only), or (b) check `authTier` / `principal` in the controller that *triggers* the publish.
9. **Don't rely on cross-channel ordering in Forest.** Per-channel order is best-effort and adapter-dependent; multi-channel order is not guaranteed. See [server/README.md](../../SOURCE/api-ape/server/README.md) Forest section.
10. **Pick the adapter to match the payload.** Postgres NOTIFY caps at 8KB. For large broadcast payloads in a cluster, use Redis ([server/adapters/README.md](../../SOURCE/api-ape/server/adapters/README.md)).
11. **Set `APIAPE_PUBSUB_LOG` only when debugging.** From [server/lib/broadcast/pubsub.js:13-39](../../SOURCE/api-ape/server/lib/broadcast/pubsub.js#L13-L39): per-publish logging is off by default precisely because high-rate producers (streaming NDJSON progress, Ollama pulls, etc.) will drown the terminal.

### Tier 3 — performance / hygiene

12. **Use `ape.clients.get(id).send` for 1:1** instead of `publish`-ing to a single-subscriber channel. Skip the subscription table entirely.
13. **Carry per-connection state in `embed`, not in a module-level Map.** Returned from `onConnect`, accessible as `this.*` in controllers and as `client.embed.*` from outside.
14. **Call `unsub()` on the client** when a component unmounts. Auto-cleanup happens on disconnect, not on navigation.
15. **Call `configureApeLogging(false)` (or pass `logging: false` to `ape(server, ...)`)** in production unless you're debugging the framework.

---

## 7. Common pitfalls (discovered in source, not always in prose docs)

- **Root README's `this.broadcastOthers` is a documentation bug.** See Tier-1 item 3. This is the most surprising footgun — copy-pasting the example fails at runtime.
- **Subscribing with `api.channel(() => {})` and then calling `api.channel({ data })` on the same path is legal** — one is subscribe, one is RPC — but there must be a controller file at that path for the RPC form to resolve. Otherwise the RPC rejects while the subscription continues working; easy to misread the resulting error.
- **Late joiners always get the last message.** If you publish "progress=100, done" and then a new subscriber arrives seconds later, they receive the `done` event and may double-act on it. Design channels so the last message is a valid steady state, not an edge event — or publish a short-lived `done`/`null` reset after the terminal event.
- **`ape.clients.get(clientId)` returns `undefined` for stale ids.** Always null-check; a client can disconnect between the moment you captured the id and the moment you send.
- **Binary payloads are hydrated asynchronously on the client.** The `<!L>` / `<!B>` / `<!A>` / `<!F>` tag system ([server/lib/fileTransfer/README.md](../../SOURCE/api-ape/server/lib/fileTransfer/README.md)) means a broadcast containing a large binary triggers a separate `/api/ape/data/:hash` fetch with the session cookie before the handler fires. Don't assume sub-millisecond delivery for binary-in-broadcast.
- **HTTP long-polling is transparent but different in practice.** Heartbeats arrive as `{type: '__heartbeat__'}` frames; handlers that log "every message received" will see them. Filter by type ([server/lib/longPolling/README.md](../../SOURCE/api-ape/server/lib/longPolling/README.md)).
- **`onConnect` can return an object synchronously or a Promise.** If it throws/rejects, the connection is closed — but the client has already been added to `ape.clients`. Anything you `send` to that clientId during the failing `onConnect` is buffered and then dropped. Don't do expensive side-effects before the final auth gate.
- **Authentication tiers do not downgrade.** Per [server/security/auth/README.md](../../SOURCE/api-ape/server/security/auth/README.md). A publish that is conditional on tier should check `authTier` at the moment of publish, not cache a boolean from earlier.
- **Channel name is the message `type` on the wire.** Publishing to `/user/42/inbox` means clients who subscribe see messages with `type: '/user/42/inbox'`. If you multiplex multiple event kinds on one channel, encode the kind inside `data`, not by varying the channel.

---

## 8. Concrete recipes for common streaming needs

### "Stream progress of a long-running job to the caller"

```js
// api/report/generate.js
module.exports = async function ({ params }) {
  const jobId = crypto.randomUUID()
  const channel = `/report/${jobId}`

  // Kick off work async; caller returns immediately with the channel id.
  setImmediate(async () => {
    for (let pct = 0; pct <= 100; pct += 10) {
      await step(pct)
      this.publish(channel, { pct })
    }
    this.publish(channel, { pct: 100, done: true, url: '/dl/xyz' })
  })

  return { jobId, channel }
}
```

Client:
```js
const { jobId, channel } = await api.report.generate({ params })
const unsub = api[channel.slice(1).split('/').reduce((o,k) => o[k], api)](msg => {
  if (msg.done) { unsub(); showDone(msg.url) } else updateBar(msg.pct)
})
// (or use the path-string subscribe form from connectSocket if you have dynamic paths)
```

This avoids a register endpoint. The one RPC returns the channel handle; all streaming afterwards flows through `publish`.

### "Notify a specific user across their tabs"

Publish to a user-scoped channel keyed by the authenticated id, not the `clientId`:

```js
ape.publish(`/user/${principal.userId}/inbox`, { kind: 'invite', from: ... })
```

Every tab/device of that user that has subscribed to `/user/${myId}/inbox` receives it.

### "Live list of online users"

```js
// Maintain a derived snapshot on connect/disconnect; publish on change.
function publishRoster() {
  const roster = [...ape.clients.values()].map(c => ({
    id: c.clientId, name: c.embed?.name
  }))
  ape.publish.presence(roster)
}

// Wire in onConnect → embed name; in onDisconnect → call publishRoster().
```

Clients: `api.presence(list => renderRoster(list))`. New tabs get the current roster immediately via last-message replay.

---

## 9. Verification

This document is research/synthesis, not a code change — there is nothing to build or test. Verification that the guidance is correct consists of:

- Each file:line reference resolves to the behavior described. Reproducible spot checks:
  - `grep -n "this.broadcastOthers\|broadcast" server/socket/receiveContext.js` — should return no definitions of `broadcast*`.
  - Read [server/lib/broadcast/pubsub.js](../../SOURCE/api-ape/server/lib/broadcast/pubsub.js) end-to-end; confirm `publish`, `subscribe`, `_lastMessages`, `cleanupClientSubscriptions` match §4.
  - Read [server/socket/receive.js:63-74](../../SOURCE/api-ape/server/socket/receive.js#L63-L74) — confirm the transport handles `{ subscribe: '/path' }` directly with no controller.
- The three idioms in §2 map 1:1 to existing patterns in `example/NextJs/ape/` and `simulator/scenarios/stories/broadcast/`.
- The "root README's `this.broadcastOthers` is a documentation bug" claim is verifiable by running either example and observing a runtime TypeError, OR by inspecting the controller context factory — whichever the user prefers.

## 10. Documentation maintenance (per CASE constitution)

None required for this task. This document is a deliverable produced to `~/.claude/plans/`, not a change to the api-ape repository. Nothing in `server/`, `client/`, `README.md`, or any `FILES.md` needs updating as a result of writing this guide.

**However, a follow-up worth flagging to the user:** the root `README.md` contains an inaccurate example (`this.broadcastOthers(...)`) that contradicts the implementation. If the user wants to fix this separately, the change would be in [README.md:75](../../SOURCE/api-ape/README.md#L75) and [README.md:109](../../SOURCE/api-ape/README.md#L109), replacing the `broadcast*` references with either `this.publish('message', {...})` or the `this.clients.forEach(...)` pattern. That is out of scope for this planning task and would need its own plan + approval.
