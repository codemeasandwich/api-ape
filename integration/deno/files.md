# Deno Integration Tests

Tests api-ape running in Deno environment.

## Directory Structure

```
deno/
└── run.ts
```

## Files

### `run.ts`

Entry point for Deno integration tests. Tests api-ape's WebSocket functionality, RPC calls, binary data transfer, broadcasts, and error handling using Deno's native WebSocket and Node.js compatibility layers.

Run with: `deno run --allow-all integration/deno/run.ts`
