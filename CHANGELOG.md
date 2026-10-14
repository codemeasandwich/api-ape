# Changelog

All notable changes to api-ape. Versions follow semantic versioning; the
GitHub release notes are generated from commit subjects by `npm run release`.

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
  `import` graphs are not evicted on Node; recursive `fs.watch` is required).
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
