# Changelog

All notable changes to api-ape. Versions follow semantic versioning; the
GitHub release notes are generated from commit subjects by `npm run release`.

## 4.3.1

Call-path fixes found while mapping api-ape onto Bluey's Bun + React build. All eight
fixes below were reproduced first with a user-story scenario against 4.3.0 (page-side
scenarios run the real browser client against a real `Bun.serve`:
`integration/bun/client-*.ts`; wire-side scenarios are in
`simulator/scenarios/stories/call-contract/`).

### Fixed

- **`this.keepalive()` resolved the call early with `undefined`.** The browser
  client took the keepalive frame for the reply. It now restarts that call's timer
  and waits for the real reply, so a 12 s call with a keepalive every 3 s works.
  Every call also runs on its own context (`Object.create` over the connection's),
  so two concurrent calls no longer overwrite each other's `this.keepalive` and
  send each other's frames.
- **N calls before the first connect opened N+1 sockets** (each queued call asked to
  connect while the reachability ping was still in flight). One connection attempt
  runs at a time now.
- **A restarted server read as `walled` for about 30 s.** A ping that fails or times
  out (or a 5xx gateway) is now `unreachable`: the state is `disconnected` and the
  client re-pings with backoff (0.5 s up to 30 s). `walled` stays for an HTTP answer
  that is not the ape ping (login page, redirect, stale replay).
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
  queued call that expires rejects instead of throwing from a timer.
- **`import api from 'api-ape'` was a flat proxy**: `api.dir.thing` was undefined,
  `api.on` was an RPC to `/on`, and a subscribe before connecting returned a
  Promise. It now uses the same `wrap()` as `connectSocket().sender`; a subscribe
  returns its unsubscribe function synchronously and is sent when the socket opens
  (and again on every reconnect).
- **Errors arrived as the message string only.** The caller now gets an `Error`
  with the thrown class and message and the `code` / `data` the controller attached
  (`err.code`, `err.data`). The server stack is not sent. A thrown string arrives as
  an `Error`.
- **`export default` controllers failed** with "controller.call is not a function";
  a function `default` is now unwrapped. `*.d.ts`, `*.test.*` and `*.spec.*` files in
  the controller folder are no longer registered as endpoints.
- **`authFramework` / `authMiddleware` were accepted and silently dropped** by
  `ape()` and `apeBun()`. They are not wired (wiring would cover WebSocket only while
  the Node long-poll path stays unauthenticated), so both functions now **throw at
  startup** naming the option. Any other unknown option logs a warning.
- **`apeBun()` ignored `logging`.**
- **`this.broadcast` and `this.broadcastOthers` were documented but absent**; they
  now exist on the controller context. `index.d.ts` no longer lists `online()` and
  `getClients()` (never real; use `this.clients`).
- **The server-side client's `api.chan.x(cb)` never subscribed** on the server.
  The first local subscriber now sends `{ subscribe }`, the last leaving sends
  `{ unsubscribe }`, and every reconnect subscribes again.

### Added

- `api-ape/jss` and `api-ape/messageHash` exports (with types) and a "Wire protocol"
  section in the server README, so programs outside api-ape can speak the protocol.
- Types: `apeBun` (`api-ape/bun`), `ApeBunHandlers`, `this.broadcast` /
  `broadcastOthers` / `send` / `keepalive` / `clients`, and the `selector`,
  `urlPrefix`, `fileTransferOptions` and `longPollingOptions` options.
- `integration/bun/client-*.ts` + `scenario-runner.ts` (the real browser client against
  a real `Bun.serve`) and `integration/bun/options.ts`, run in CI.

### Behaviour changes

- `this.foo = x` inside a controller is now private to that call (it used to land on
  a context shared by the connection's calls by accident). Keep per-connection state
  in `onConnect`'s `embed`.
- A controller file that exports something that is not a function now stops
  startup, naming the file (it used to fail at the first call).
- A controller that returns nothing now sends a reply (`undefined`).
- An error reply carries `err` as a JSS-encoded `Error`. A client that reads the frame with plain `JSON.parse` (a probe, another language) sees the key `err<!E>` (`[name, message, stack]`) instead of a string `err`; read frames with `api-ape/jss` (`parse`), or take `err<!E>[1]` as the message. The browser, Node and Bun clients, including 4.3.0's, are unaffected. `integration/shared/scenarios.js` is updated accordingly.
- An unreachable server is `disconnected`, not `walled`; check for `walled` only for
  captive portals.
- `ape()` / `apeBun()` throw on `authFramework` / `authMiddleware`.
- Not fixed here: binary transfer under Bun, the generated `api-ape.d.ts` type
  checking, and a TypeScript controller that mixes `import` with `module.exports`
  (does not load under Bun; use `export default`).

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
