# Changelog

All notable changes to api-ape. Versions follow semantic versioning; the
GitHub release notes are generated from commit subjects by `npm run release`.

## 4.4.0

**Security fix, plus call-path fixes** found while mapping api-ape onto Bluey's Bun +
React build and then reviewed independently. The version is 4.4.0 because it adds
exports and methods (`api-ape/jss`, `api-ape/messageHash`, `this.broadcast`, ...); there
is no 4.3.1 on npm, and everything an earlier draft called 4.3.1 is in this release. Each
fix was reproduced first with a user-story scenario against 4.3.0 (page-side scenarios
run the real browser client against a real `Bun.serve`, or `ape()` on a Node
`http.Server` for the HTTP streaming path: `integration/bun/client-*.ts`; wire-side
scenarios are in `simulator/scenarios/stories/call-contract/`).

### Security

**Upgrade to 4.4.0 if your server accepts connections from anyone you do not control.**

- **Affected:** every release from 1.0.1 (the first tag) to 4.3.0 contains the flaw (versions older than the tags were not checked). Treat all earlier versions as affected.
- **Impact:** every frame a client sends is decoded before the server looks at what it
  asks for, and the decoder built the error class **named in the frame** by looking the
  name up among the process's globals. A client that could open a socket, with no login
  and no valid endpoint, could therefore make the server construct any global of its
  choosing. (A browser page of another site is stopped by the Origin check; a script or
  any non-browser client is not.) Under **Bun** that includes a worker that runs the client's own script
  inside the server process: remote code execution. Under **Node and Bun** it includes a
  WebSocket the server opens to an address the client picked (on Node 22 and later, where
  `WebSocket` is a global): the server can be made to call hosts only it can reach. The WebSocket path, the HTTP long-poll `POST`, the server-side
  client (`server/client`, parsing what another server sends) and `api-ape/jss` (wherever an
  application parsed text from outside) all use the same decoder.
- **Fix:** the decoder builds only the standard Error classes from a fixed list (`Error`,
  `TypeError`, `RangeError`, `SyntaxError`, `ReferenceError`, `EvalError`, `URIError`,
  `AggregateError`); any other name becomes a plain `Error` that carries the name as
  text. Nothing in api-ape indexes the globals with text from a peer any more.
- **Denial of service in the same decoder:** the parser for tagged keys (`name<!D>`)
  backtracked cubically on a key such as `a<!a<!a<!...` with no closing `>`; a 6 KB key
  froze the event loop for tens of seconds, again before any endpoint is looked up. It
  is a linear scan now.
- **Prototype pollution through pointers, found in review of this fix.** A frame could
  make the decoder write to `Object.prototype` (so every object in the server process
  inherits what the peer chose: `isAdmin`-style checks), to `Map`, `Set`, `Date` or
  `Function` and their prototypes, by naming a duplicate key (`a` and `a<!M>`) and a
  `__proto__` / `constructor` path under it. The decoder now records the object a pointer
  sits in instead of walking a peer-supplied path later, follows source paths through own
  properties only, and refuses a frame that decodes two keys to one name. It was reachable
  on the WebSocket and the HTTP long-poll `POST`.
- **Denial of service with no login, closed:**
  - an inline-binary tag (`name<!I>`) took `{ "length": N }` and allocated N bytes (a
    50-byte frame blocked the server for seconds, minutes at 2 GB): it takes base64 text only;
  - the tagged-key parser backtracked cubically (above);
  - the built-in WebSocket server had **no limit on message size** (a 1 MiB cap in the
    source was passed to a library that was not in use) and threw out of its data handler on
    a frame announcing a length of 4 GiB or more, which ends the process: messages are now
    limited by `maxMessageBytes` (default 16 MiB, see Breaking) and an oversize or malformed
    frame closes the socket with 1009 / 1002;
  - the HTTP long-poll `POST` read any body into memory: it answers 413 over
    `maxMessageBytes`.
- **Related holes closed in the same change** (all reachable by the same kind of client,
  found by reading every place peer text is used as a name): a call whose endpoint name is
  one every object inherits (`valueOf`, `constructor`) was answered by that built-in
  instead of "not found", and `valueOf` handed the connection's context back to the
  caller; tag names in a frame could reach `Function` or `Object`; a `__proto__` key
  replaced the prototype of the decoded object; and an upload field name that walked
  through `constructor.prototype` wrote to `Object.prototype` (it needed a completed upload
  on a server with file transfer). The browser client had the same two path bugs in
  handling a server's reply (a file under a `constructor.prototype` key polluted the page);
  it uses the same guarded code.
- **Until you can upgrade:** do not expose the server to untrusted networks, or put an
  authenticating gateway in front of it. There is no configuration switch that avoids the
  flaw. The new scenarios fail on 4.3.0 and pass on 4.4.0
  (`integration/bun/security-decode.ts`,
  `simulator/scenarios/stories/call-contract/hostile-peer.test.js`,
  `utils/jss/decode.test.js`).

### Breaking

- **Messages over `maxMessageBytes` are refused.** New option, default **16 MiB**: the most
  one inbound WebSocket message or one long-poll POST body may hold (a WebSocket gets close
  code 1009, a POST gets HTTP 413). Under Bun the default is Bun's own (16 MiB;
  `websocketOptions.maxPayloadLength` still overrides it); on Node the built-in server had no
  limit at all, so a Node server that took messages over 16 MiB must raise the option.
  Uploads are separate HTTP PUTs and are not limited. Lower it if your calls are small: it is
  what bounds the memory and parse time a stranger can spend before any login.
- **`authFramework` / `authMiddleware` throw at startup** in `ape()` and `apeBun()`. 4.3.0
  and earlier accepted and silently dropped them, so nothing was enforced. They are not
  wired (they would cover the WebSocket path only; the HTTP long-poll path has no auth
  hooks). Authenticate in `onConnect` and check `this.user` in controllers.
- **A controller file that exports something that is not a function stops startup**,
  naming the file (it used to fail at the first call).
- **`this.foo = x` inside a controller is private to that call** (it used to land on a
  context shared by the connection's calls by accident). Keep per-connection state in
  `onConnect`'s `embed`.
- **`online()` and `getClients()` are gone from the types** (`index.d.ts`); they never
  existed at runtime. Use `this.clients`.
- **The error reply frame changed shape for programs that read raw JSON.** `err` is a
  JSS-encoded `Error`: read with plain `JSON.parse` the key is `err<!E>`
  (`[name, message, stack]`) instead of a string `err`, and `errCode` / `errData` ride
  beside it. Read frames with `api-ape/jss` (`parse`), or take `err<!E>[1]` as the
  message. The browser, Node and Bun clients, including 4.3.0's, are unaffected. The HTTP
  long-poll path now answers in the same shape (HTTP 500 / 404 with the same frame; it was
  `{ err: "<message>", queryId }`, or `{ error }` for a missing endpoint).

### Fixed

- **A peer can no longer make the server construct arbitrary globals** (see Security).
- **`this.keepalive()` resolved the call early with `undefined`.** The browser
  client took the keepalive frame for the reply. It now restarts that call's timer
  and waits for the real reply, so a 12 s call with a keepalive every 3 s works.
  Every call also runs on its own context (`Object.create` over the connection's),
  so two concurrent calls no longer overwrite each other's `this.keepalive` and
  send each other's frames.
- **N calls before the first connect opened N+1 sockets** (each queued call asked to
  connect while the reachability ping was still in flight). One connection attempt
  runs at a time now.
- **A call that landed between a failed ping and its scheduled retry opened a second
  socket**: the call connected, then the retry connected again (three `onConnect`s for
  one page, every broadcast twice, and the orphan's close marked the live socket not
  ready). The retry is cancelled when an attempt starts and when a socket opens, an
  attempt returns early when a socket is open or connecting, and only the live socket's
  close changes the client's state.
- **Calls made during an outage each pinged again**, bypassing the 0.5 s to 30 s backoff
  (about 75 pings in 3 s at one call per 40 ms). While a retry is scheduled a call now
  only queues; the browser's `online` event still pings at once. A call still queued 5 s
  after it was made rejects with `Request not sent`, as before.
- **A ping whose answer started and never finished held the connection attempt (and
  every queued call) for good.** The 3 s abort now covers reading the body, and the
  15 s "attempt in flight" flag does not expire while a WebSocket handshake is pending.
- **A restarted server read as `walled` for about 30 s.** A ping that fails or times out
  (or a 5xx gateway) is now `unreachable`: the state is `disconnected` and the
  client re-pings with backoff (0.5 s up to 30 s, with up to 20 % jitter added on top of
  the 30 s cap, so at most 36 s). `walled` stays for an HTTP answer that is not the ape
  ping (login page, redirect, stale replay).
- **A captive portal that redirects to its login page on another site read
  `disconnected`**, because following the redirect is a cross-origin failure that `fetch`
  reports as a thrown error. The ping no longer follows redirects (`redirect: "manual"`),
  so the redirect itself reads `walled`.
- **Calls made while the page was reconnecting were never sent** after the first
  flush (the queue array was replaced instead of emptied). Found by the restart
  scenarios.
- **Two identical calls in the same millisecond produced one 10 s timeout** (same
  message, same `queryId`, refused as a replay). The browser and the Node/Bun client
  add a per-client counter `nonce` to each call.
- **`await api.x()` never armed the timeout, `.then(ok, err)` dropped `err`, and a
  controller returning `undefined` sent no reply** (the call hung). The timeout is
  armed when the call is made, the promise is a plain promise, `undefined` is
  answered (`data<!U>`), a call nobody awaits raises no unhandled rejection, and a
  queued call that expires rejects instead of throwing from a timer. A call that times
  out, or whose socket refuses the send, is forgotten (its timer and its `waitingOn`
  entry are cleared); a reply that arrives for a call that is gone is dropped instead of
  reaching the page as a push.
- **`import api from 'api-ape'` was a flat proxy**: `api.dir.thing` was undefined,
  `api.on` was an RPC to `/on`, and a subscribe before connecting returned a
  Promise. It now uses the same `wrap()` as `connectSocket().sender`; a subscribe
  returns its unsubscribe function synchronously and is sent when the socket opens
  (and again on every reconnect).
- **`api.onConnectionChange(handler)` was registered twice once the client was ready**,
  so the handler ran twice for every state change. It is registered once.
- **Errors arrived as the message string only.** The caller now gets an `Error`
  with the thrown class and message and the `code` / `data` the controller attached
  (`err.code`, `err.data`). The server stack is not sent: every Error that leaves the server has the stack `Name: message`, whether it was thrown, a thrown string, an unknown endpoint, a push, or sits inside a thrown object or array. A thrown string arrives as an
  `Error`. 4.3.0 sent the message only; what 4.4.0 forwards is deliberately narrow, because
  a thrown value is whatever a controller's libraries produced: `code` only when it is a
  string or a number on the error's own enumerable properties; `data` only when it is own
  plain data (strings, numbers, booleans, `null`, arrays, plain objects, `Date`s; not
  functions, class instances, `BigInt`s, cycles, nesting over 32 levels or more than 10000
  objects); nothing at all from a Node system error (`syscall` / `errno`: `ECONNREFUSED`,
  `ENOENT` carry paths and addresses). Attach them to errors you throw and wrap a
  library's error before it leaves a controller. A thrown plain object arrives without its
  own `stack`, and a thrown value that cannot be read or serialised arrives as an `Error`
  saying so (the caller no longer waits out its timeout; the server never throws while
  building the reply).
- **A call over the HTTP long-poll / streaming fallback did not behave like one over a
  WebSocket.** A controller error reached the page as `Request failed: 500`;
  `this.broadcast`, `this.broadcastOthers` and `this.keepalive()` were missing from the
  controller's `this`; a controller that returned nothing dropped its `data`; and once
  the page had fallen back to streaming every call after the first failed with
  `getSocket().send is not a function`. The POST and the SSE stream now use the same
  frames (`dataFrame` / `errorFrame` / `keepaliveFrame` in `utils/wireError.js`) and the
  same context (`createControllerContext` + `createCallContext`) as the WebSocket path,
  an unknown endpoint gives the same 404 message, the streaming client rejects with the
  thrown `Error` (`err.code`, `err.data`) and drops keepalive frames, and calls made once
  connected go over the streaming transport. One difference stays: an `embed` that names
  `clientId` or `sessionId` replaces them on this transport, as it always did; on a
  WebSocket the connection's own win.
- **The HTTP streaming client never reconnected its stream** after the server recycled it
  (about every 25 s) or it broke: the reconnect timer called `connect()`, which refuses to
  run while the transport is active. The page then had no pushes, and the server had
  dropped its state (embed, keepalive target). It reopens the stream now, with the 0.5 s
  doubling to 30 s delay of the ping retry (it was a fixed 0.5 s against a server that is
  down), logs the first failure of an outage as an error and the retries as debug, and
  starts each stream with an empty parse buffer.
- **A controller that threw a falsy value (`0`, `""`, `null`, `false`) was answered as a
  success over a WebSocket.** It is an error reply on both transports now.
- **A call with an argument that cannot be serialised (a `BigInt`)** left a timer armed
  that fired 10 s later with an uncaught exception (a crash in the Node and Bun client).
- **On the HTTP long-poll path `this.sessionId` ignored `x-ape-session-id` and URL-encoded
  cookies**, which the WebSocket path honours; both use one parser now.
- **`export default` controllers failed** with "controller.call is not a function";
  a function `default` is now unwrapped. `*.d.ts`, `*.test.*` and `*.spec.*` files in
  the controller folder are no longer registered as endpoints.
- **`authFramework` / `authMiddleware` were accepted and silently dropped** (see
  Breaking). Any other unknown option logs a warning. `ape()` / `apeBun()` called with no
  options object say what is needed instead of throwing a `TypeError`.
- **`apeBun()` ignored `logging`.**
- **`this.broadcast` and `this.broadcastOthers` were documented but absent**; they
  now exist on the controller context, and an app that embeds its own `broadcast` /
  `broadcastOthers` in `onConnect` keeps them. The server-side client's `api.chan.x(cb)`
  never subscribed on the server: the first local subscriber now sends `{ subscribe }`,
  the last leaving sends `{ unsubscribe }`, and every reconnect subscribes again.

### Added

- `api-ape/jss` and `api-ape/messageHash` exports (with types) and a "Wire protocol"
  section in the server README, so programs outside api-ape can speak the protocol.
- Types: `apeBun` (`api-ape/bun`), `ApeBunHandlers`, `this.broadcast` /
  `broadcastOthers` / `send` / `keepalive` / `clients`, and the `selector`,
  `urlPrefix`, `fileTransferOptions` and `longPollingOptions` options.
- `utils/safeKeys.js` (`hasOwn`, `setKey`): the one way peer text indexes an object.
- Scenario tests: `integration/bun/client-*.ts` (including `client-race.ts` and
  `client-streaming.ts`) + `scenario-runner.ts` (the real browser client against a real
  `Bun.serve`, or `ape()` on a Node `http.Server`), `integration/bun/options.ts` and
  `integration/bun/security-decode.ts`, run in CI.

### Behaviour changes

- A controller that returns nothing now sends a reply (`undefined`).
- The ping no longer follows redirects. A server or proxy that redirects `/api/ape/ping`
  itself (an http-to-https or canonical-host redirect) now reads `walled` and is retried
  every 30 s: serve the ping directly.
- On the long-poll path `embed` values are applied as on a WebSocket, so an embed that
  names `req`, `send` or `agent` replaces them (before, `req` always won).
- An unreachable server is `disconnected`, not `walled`; check for `walled` only for
  captive portals. While the next ping is scheduled, calls only queue.
- An error whose class is not one of the eight standard ones arrives as a plain `Error`
  carrying the sender's `name` (before, a global of that name on the receiver, such as
  `DOMException`, was constructed instead).
- On a Node server the long-poll POST answers with HTTP 404 and the error frame for an
  unknown endpoint (it was `{ "error": "Controller ... not found" }`).
- Not fixed here: binary transfer under Bun, the generated `api-ape.d.ts` type
  checking, a TypeScript controller that mixes `import` with `module.exports`
  (does not load under Bun; use `export default`), `{ subscribe }` frames over the HTTP
  long-poll path (the POST handler only routes calls), the decoder builds the `RegExp` a
  peer sends (construction is cheap and the server never runs it; a controller that tests
  text against a peer's pattern can be slowed by it), calls over HTTP streaming have no
  client-side timeout (a POST that never answers never rejects), the long-poll endpoints
  have no Origin check, a call made while the live
  socket is closing queues until the reconnect, the 30 s WebSocket-upgrade retry does not
  look at a pending handshake, and the server-side client (`server/client`) still leaves a
  call's timer armed when its `send` throws.

### Mixed versions

- **Old browser, Node or Bun clients (4.3.0 and earlier) with a 4.4.0 server:** everything
  works, but they keep their old behaviour: a `this.keepalive()` frame still resolves an
  old browser client's call early with `undefined`, identical calls in the same
  millisecond are still refused as replays (no `nonce`), and an old client does not put
  `err.code` / `err.data` on the Error. An old streaming client shows the generic
  `Request failed: 500` for a controller error from a 4.4.0 server.
- **A 4.4.0 client with an older server:** a controller that returns nothing sends no
  reply on 4.3.0, so the call times out after 10 s (the 4.3.0 client hung forever);
  errors arrive as a plain string, as before; a 4.3.0 streaming server's `{ error }` bodies are
  still understood (a 4.3.0 server's `{ err: "message" }` body becomes an `Error` with that
  message).
- Upgrade servers first; they are the ones exposed to the security flaw.

## 4.3.0

The first release after 4.1.1 (the local 4.2.0 was never tagged or published, so
its changes ship here). Bun hardening, driven by Bluey (a Bun + React app over api-ape). Fixes the gaps
listed in "api-ape under Bun" below and adds three opt-in options. Two defaults
change; see "Behaviour changes".

### Fixed

- **The Origin check now runs under Bun.** A Fetch `Request` has `Headers` with
  `.get()`, but the check read `req.headers["origin"]`, so `Origin` and `Host`
  were always `undefined` and every upgrade passed. The check now runs before
  `server.upgrade()` and a refused page gets HTTP 403 (`api-ape/bun` and
  `ape(server)` on a Bun server).
- **Headers reach controllers under Bun as under Node.** The upgrade request
  handed to `onConnect` and `this.req` is Node-shaped: `headers` is a plain
  lower-case object (`cookie`, `user-agent`, `origin`, `x-ape-session-id`),
  `url` is path + query, `socket.remoteAddress` is filled from
  `server.requestIP`. Before, every connect minted a new session id (resume never
  matched) and `this.agent` was empty. `headers.get()`/`.has()` and
  `req.rawRequest` (the Fetch `Request`) cover the common Bun-style reads; other
  `Headers` methods (`entries`, `forEach`, `getSetCookie`) are not provided, use
  `req.rawRequest.headers`.
- **`this.sessionId` in controllers** used a regex with an escaped `\s` that only
  matched when `sessionId` was the first cookie, and ignored `x-ape-session-id`.
  It now uses the same parser as the connection (`sessionIdentity`).
- **A refused Origin now closes the socket on Node with the `ws` library**
  (`ws.WebSocket` has no `destroy()`, so the old check silently left the socket
  open) and on Bun (`BunWebSocket.destroy()` closes with 1008). On Node the
  upgrade itself is refused with a 403 before the handshake completes.

### Added

- `origin: { mode, allowedOrigins, allowedHosts }` on `ape()` and `apeBun()`.
  `mode: 'exact'` compares scheme-normalised host **and port**, so a page on
  another port of localhost is refused. `allowedOrigins` admits extra exact
  origins; `allowedHosts` refuses any `Host` not listed (DNS rebinding guard).
- `watch: true | { paths, debounceMs }`: opt-in hot reload that is coherent
  (see below). `apeBun()` returns `close()` to stop it;
  `deepRequire.stopWatching(controllers)` does the same on Node.
- `websocketOptions` (Bun): forwards `idleTimeout`, `sendPings`,
  `maxPayloadLength`, `backpressureLimit`, `closeOnBackpressureLimit`,
  `perMessageDeflate`, `publishToSelf` to `Bun.serve({ websocket })`.
- `integration/bun/security.ts` and `integration/bun/hot-reload.ts`, run in CI
  under Bun: Origin, headers, keepalive frames, Bun idle timeout and pings,
  allowedOrigins/allowedHosts, and reload behaviour.
- Documentation: server README sections "Hot Reload", "Origin check", "Bun" and
  "Keepalive and ping".

### Behaviour changes

- **Hot reload is off by default** (it was always on, in production too). Pass
  `watch: true` in development. When on, a change evicts every module under the
  controller directory and `watch.paths` from `require.cache` and reloads all
  controllers together, instead of reloading only the edited controller file
  while its imports stayed stale. A controller that fails to load keeps the
  previous set serving. Deleting a file removes its endpoint. Limits are in the
  server README (modules outside the watched directories stay cached; ESM
  `import` graphs are not evicted on Node). Watching behaves the same everywhere:
  one recursive `fs.watch` where supported, otherwise (Linux before Node 20, or
  `watch: { recursive: false }`) one watcher per directory.
- **Under Bun the Origin default is `exact`** (host and port). A page served
  from another origin, such as a dev server on another port, is refused unless
  listed in `origin.allowedOrigins` or you pass `origin: { mode: 'root-domain' }`.
  Node's default is unchanged (`root-domain`, ports ignored).
- On Node, a refused Origin is now actually refused: an HTTP 403 at the upgrade
  (before: with the `ws` library the socket was left open with no handlers).
  Cross-root-domain setups that only worked because of that will now fail.
- Origin policy options are validated at start-up; a misspelt key, a non-string
  entry or a malformed `allowedOrigins` entry throws.
- `exact` mode limits (see server README "Origin check"): the Origin scheme is not
  compared with the real transport, a rebinding page matches unless `allowedHosts`
  is set, and a reverse proxy that rewrites `Host` is refused.
- The Vite plugin now defaults `watch: true` (dev server only) and stops the
  previous watcher when Vite restarts. Examples that relied on the old
  always-on reload now pass `watch: true`.
- Under Bun, `this.req.url` is now path + query (as on Node) instead of the
  absolute URL, and `this.req` is a Node-shaped object rather than the Fetch
  `Request` (use `this.req.rawRequest` for the latter).

### api-ape under Bun: what is and is not provided

- Transport is WebSocket only. The HTTP long-poll fallback (`/ape/poll`), file
  transfer over HTTP (`/ape/data/...`) and the schema endpoint are Node-only.
  Acceptable on loopback.
- Keepalive: api-ape sends no WebSocket pings of its own. `this.keepalive()`
  resets the client's 10 s per-call timer only; the server's 10 s freshness check
  on an incoming call is unaffected. Bun sends pings (`sendPings`, default true)
  and closes sockets silent for `idleTimeout` seconds (default 120, enforced on a
  coarse timer). `GET /ape/ping` is an HTTP probe, not a heartbeat.

### Also in this release

Everything committed since v4.1.1 (`git log v4.1.1..HEAD`). Notably: `apeBun()`
and the `api-ape/bun` export (not in the published 4.1.1), the Vite plugin, the
schema endpoint and type tooling, absolute `where` with a decoupled `urlPrefix`,
Phase 1 logical reconnect with `clientId` resume, configurable framework logging,
and module-level `broadcast()`.
