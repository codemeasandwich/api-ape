# Bun Integration Tests

Tests api-ape running in Bun with the native `Bun.serve()` API.

## Directory Structure

```
bun/
└── run.ts
```

## Files

### `run.ts`

Entry point for the Bun integration tests. It mounts `apeBun()` over `integration/test-api`, runs the shared scenarios (WebSocket connection, RPC calls, binary transfer, broadcasts, error handling), then checks the `selector` option: with `selector: ['js', 'ts']` the TypeScript controller in `integration/test-api-ts` answers, and with the default selector it is ignored.

Run with: `bun integration/bun/run.ts`
