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
├── hot-reload.ts   # Opt-in hot reload: default off, watch.paths coherent, documented limit
├── scenario-runner.ts   # Runs a scenario's page half (real browser client) in a child process against a real Bun.serve
└── client-keepalive.ts  # Keepalive user stories through the real browser client
```

## Files

### `run.ts`

Entry point for the core Bun integration tests. Mounts `apeBun()` over `integration/test-api`, runs the shared scenarios (WebSocket connection, RPC calls, binary transfer, broadcasts, error handling), then checks the `selector` option: with `selector: ['js', 'ts']` the TypeScript controller in `integration/test-api-ts` answers, and with the default selector it is ignored.

### `security.ts`

Origin check (exact host:port accepted, another port and a foreign domain refused with 403, no Origin accepted, `allowedOrigins`, `allowedHosts`); headers reaching controllers (`cookie`, `sessionId`, `x-ape-session-id`, user agent, `headers.get`, peer address); `this.keepalive()` frames; `GET /ape/ping`; Bun `idleTimeout` with and without `sendPings`.

### `scenario-runner.ts`

Shared runner for scenarios that need the REAL browser client. The browser client is a process-wide singleton, so the runner starts `Bun.serve` + `apeBun()` in the parent, runs the page half of each scenario in a child `bun` with `window`/`document`/`location`/`navigator` shimmed, and hands both views to the scenario's `check`. A scenario file calls `runScenarios(import.meta.path, title, scenarios)`. `APE_ROOT=/other/checkout` runs the same scenarios against another api-ape checkout; `ONLY=<substring>` runs matching scenarios.

### `client-keepalive.ts`

Keepalive stories: a slow call resolves with its real result (not `undefined` from the first keepalive), a 12 s call survives the 10 s timeout because each keepalive restarts the timer, and two slow calls at once get their own results.

### `hot-reload.ts`

Without `watch` an edit changes nothing; with `watch.paths` a service module and every controller importing it reload together (including a controller whose file did not change); with `watch: true` alone a module outside the controller directory stays cached (the documented limit).
