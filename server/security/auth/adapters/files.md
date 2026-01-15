# Authentication Adapters Files

This directory contains protocol-specific authentication adapters. Each adapter implements a specific authentication protocol and is registered with the auth framework.

## Guidelines

- **Session isolation** — Pending sessions are keyed by `clientId:username` for concurrent auth support
- **Nonce binding** — Server nonces bind auth transcript to specific connection parameters
- **Cleanup on disconnect** — Call `cleanupClient()` when socket disconnects

## Directory Structure

```
adapters/
├── opaque.js          # OPAQUE adapter factory and enums
└── opaque-handlers.js # OPAQUE message handlers
```

## Files

### `opaque.js`

OPAQUE protocol adapter for zero-knowledge password authentication:

- Server never learns the user's raw password
- `createOpaqueAdapter(config)` — Creates adapter with user storage functions
- Exports `OpaqueMessageType` and `OpaqueError` enums
- Supports optional `@cloudflare/opaque` library for cryptographic operations

### `opaque-handlers.js`

OPAQUE message handler implementations:

- Registration flow: `handleRegStart`, `handleRegFinish`
- Auth flow: `handleAuthStart`, `handleAuthFinish`
- Manages pending sessions with automatic expiry cleanup
- Creates user principal on successful authentication
