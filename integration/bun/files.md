# Bun Integration Tests Files

Tests that run api-ape under the real Bun runtime (`Bun.serve`). They are run by CI (`.github/workflows/publish.yml`, Bun job) and by `npm run test:bun` in `integration/`.

## Guidelines

- **Real runtime only** — These scripts need Bun; the Jest suite covers the same logic on Node with fakes
- **No fixed ports** — Use `port: 0` so runs never collide
- **Prove the failure** — `APE_ROOT=/path/to/older/checkout bun integration/bun/security.ts` runs the same checks against another api-ape checkout, to confirm the tests fail on old code
- **Clean up** — Temporary controller directories are removed and servers stopped before exit

## Directory Structure

```
bun/
├── run.ts          # Core RPC scenarios over Bun.serve (shared scenarios)
├── security.ts     # Origin, headers, keepalive, Bun idle timeout/pings
├── security-decode.ts   # A stranger's error tag (Worker, WebSocket) builds nothing in the server process
├── hot-reload.ts   # Opt-in hot reload: default off, watch.paths coherent, documented limit
├── scenario-runner.ts   # Runs a scenario's page half (real browser client) in a child process against a real Bun.serve
├── client-keepalive.ts  # Keepalive user stories through the real browser client
├── client-connect.ts    # Connection user stories (one socket per page, restart recovery, captive portal)
├── client-calls.ts      # Call user stories (identical calls, awaited calls, errors)
├── client-api.ts        # Page API: nested api.dir.thing(), early subscribe, api.on, transport
├── client-errors.ts     # Errors (class, code, data) and controller files (export default, .d.ts, tests)
└── options.ts           # apeBun options: unsupported auth options throw, typos warn, logging honoured
```

## Files

### `run.ts`

Entry point for the core Bun integration tests. Mounts `apeBun()` over `integration/test-api`, runs the shared scenarios (WebSocket connection, RPC calls, binary transfer, broadcasts, error handling), then checks the `selector` option: with `selector: ['js', 'ts']` the TypeScript controller in `integration/test-api-ts` answers, and with the default selector it is ignored.

### `security.ts`

Origin check (exact host:port accepted, another port and a foreign domain refused with 403, no Origin accepted, `allowedOrigins`, `allowedHosts`); headers reaching controllers (`cookie`, `sessionId`, `x-ape-session-id`, user agent, `headers.get`, peer address); `this.keepalive()` frames; `GET /ape/ping`; Bun `idleTimeout` with and without `sendPings`.

### `security-decode.ts`

The decoder as a security boundary under real Bun: a raw peer sends a frame whose error tag names `Worker` (carrying a `data:` script that would write a marker file) or `WebSocket` (carrying the address of a local listener). Nothing may run and nothing may connect; honest calls and a standard `TypeError` still work. `APE_ROOT=/older/checkout` shows it failing on 4.3.1 and earlier.

### `scenario-runner.ts`

Shared runner for scenarios that need the REAL browser client. The browser client is a process-wide singleton, so the runner starts `Bun.serve` + `apeBun()` in the parent, runs the page half of each scenario in a child `bun` with `window`/`document`/`location`/`navigator` shimmed, and hands both views to the scenario's `check`. A scenario file calls `runScenarios(import.meta.path, title, scenarios)`. `APE_ROOT=/other/checkout` runs the same scenarios against another api-ape checkout; `ONLY=<substring>` runs matching scenarios.

### `client-keepalive.ts`

Keepalive stories: a slow call resolves with its real result (not `undefined` from the first keepalive), a 12 s call survives the 10 s timeout because each keepalive restarts the timer, and two slow calls at once get their own results.

### `client-connect.ts`

Connection stories through the real browser client: a page that makes calls before it has connected opens exactly one socket; after a server restart (or a server that is not up yet) the page says `disconnected`, never `walled`, and reconnects within seconds; a call made during the outage is sent when the server is back; a login page in place of the ping still reads `walled`. `Scenario.startDown`, `Scenario.fetch` and `onEvent` (server stop/start) drive these.

### `client-calls.ts`

Call stories through the real browser client: five identical calls in the same millisecond each get their own reply (per-client `nonce`); a controller that returns nothing resolves `undefined`; a call the server never answers times out after 10 s; `.then(ok, err)` receives the error; a failed or expired call nobody looks at raises no unhandled rejection or uncaught exception (the runner reports those as `errors`).

### `client-api.ts`

The default export as the README shows it: `api.dir.thing()` and `api.dir()` for nested endpoints, a subscribe made before connecting returns the unsubscribe function at once and then receives (and stops receiving) the channel, `api.on(type, handler)` receives pushes, `api.transport` and `api.onConnectionChange`.

### `client-errors.ts`

What a page's catch block sees: a `TypeError` with its message and no server paths, `err.code` / `err.data`, a thrown string as an Error; and controller files: a TypeScript `export default` controller answers, `.d.ts` and `.test.ts` files next to controllers are not endpoints.

### `options.ts`

Under real Bun: `apeBun` throws on `authFramework` / `authMiddleware` (they were silently dropped before 4.3.1), names a mistyped option in a warning, and routes the framework's log lines to the `logging` sink it is given (apeBun ignored `logging` before).

### `hot-reload.ts`

Without `watch` an edit changes nothing; with `watch.paths` a service module and every controller importing it reload together (including a controller whose file did not change); with `watch: true` alone a module outside the controller directory stays cached (the documented limit).
