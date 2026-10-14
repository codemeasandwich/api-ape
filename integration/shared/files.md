# Shared Integration Harness

Cross-runtime scaffolding shared by Node, Bun, Deno, Express, and Next.js integration runners.

## Directory Structure

```
shared/
├── check-runtimes.js         # Quick CLI summarizing locally installed JS runtimes
├── scenarios.js              # Declarative WebSocket/API scenarios exercised by runners
├── test-runner.js            # Executes scenarios with timing + lightweight assertions
└── …                         # Additional helpers reused by adapters (see filenames)
```

## Files

### `check-runtimes.js`

Developer ergonomics diagnostic that prints availability of Node, Bun, Deno binaries on the local PATH (reads versions via synchronous `execSync`).

### `scenarios.js`

The shared scenario list (`scenarios`): WebSocket connection, RPC call, binary transfer, broadcast and error handling, each a `run({ server, WebSocket, expect, Buffer })` step. Also exports `messageHash`, api-ape's queryId function (Jenkins hash in Base32), so a runner can match the reply to an extra call of its own.

### `test-runner.js`

Async harness that consumes `{ scenarios }`, drives each `{ run({ server, WebSocket })}` snippet, aggregates pass/fail counts, and emits human-readable TAP-like output for CI logs.
