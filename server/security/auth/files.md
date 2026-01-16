# Authentication Module Files

This module provides tiered authentication for api-ape WebSocket connections. It implements a state machine that enforces no-downgrade rules and coordinates multiple authentication adapters (OPAQUE, future LDAP/SAML/OAuth2).

## Guidelines

- **No tier downgrade** — Once authenticated, connections cannot drop to a lower tier
- **State machine integrity** — Always use `startAuth()` before processing auth messages
- **Adapter isolation** — Each adapter handles its own protocol; framework coordinates
- **Per-socket state** — Each connection has its own state machine instance

## Directory Structure

```
auth/
├── index.js             # Framework coordinator, adapter registry
├── state-machine.js     # Per-socket auth state management
├── state-machine-mfa.js # MFA elevation functions
├── nonce-manager.js     # Single-use nonce generation and validation
├── adapters/            # Protocol-specific adapters
│   └── opaque.js        # OPAQUE password auth
└── handlers/            # Message routing
    └── auth-messages.js
```

## Files

### `index.js`

Authentication framework coordinator:

- `createAuthFramework(config)` — Creates framework with adapters and callbacks
- `createSocketAuth(clientId)` — Creates per-socket auth manager with state machine
- `isAuthMessage(type)` — Checks if message type is auth-related
- Routes OPAQUE messages to adapter, updates state machine on success/failure
- Exports `AuthState`, `AuthTier`, `AuthError` enums for external use

### `state-machine.js`

Per-socket authentication state management:

- Tracks auth state transitions: GUEST → AUTHENTICATING → AUTHENTICATED → ELEVATED → HIGH_SECURITY
- Enforces tier requirements (0=guest, 1=basic, 2=elevated, 3=high security)
- Rate limiting with configurable max attempts and lockout duration
- Single-use nonce generation and validation

### `state-machine-mfa.js`

MFA elevation functions for tier 2 authentication:

- `startMFA(methods)` — Initiates MFA elevation flow
- `completeMFA(method)` — Completes MFA and transitions to ELEVATED state
- Updates principal with `elevatedAt` timestamp and `mfaMethod`

### `nonce-manager.js`

Single-use server nonce generation and validation:

- `generateNonce(length)` — Creates cryptographic nonce with expiry
- `consumeNonce(nonce)` — Validates and marks nonce as used
- Automatic cleanup of expired nonces
