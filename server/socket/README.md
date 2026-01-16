# Socket Module

## Overview

The socket module handles WebSocket message processing for api-ape servers. It manages the complete lifecycle of messages flowing between clients and controllers—from initial connection validation through message parsing, controller invocation, and response serialization.

**Key capabilities:**

- **Connection validation** — Verify origin headers and enforce security policies before accepting connections
- **Message parsing** — Deserialize incoming WebSocket messages with JSS encoding support
- **Controller routing** — Route messages to the appropriate controller based on the `type` field
- **Pub/sub handling** — Process `subscribe` and `unsubscribe` messages for channel subscriptions
- **Binary data coordination** — Detect upload tags, wait for HTTP uploads, and inject binary data into messages
- **Response serialization** — Serialize controller responses and handle binary data with download links
- **Request correlation** — Match responses to requests via `queryId` for Promise resolution on the client

This module is the bridge between raw WebSocket frames and the high-level controller functions that developers write.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Message Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      Incoming Message                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WebSocket Frame                                                 │
│       │                                                          │
│       ▼                                                          │
│  receive.js                                                      │
│       │ Parse JSS → { type, data, queryId }                      │
│       │ Find upload tags → [{ path, hash, tag }]                 │
│       │ Wait for HTTP uploads (if any)                           │
│       │ Inject binary data at paths                              │
│       ▼                                                          │
│  Controller                                                      │
│       │ this = { clientId, sessionId, broadcast, ...embed }      │
│       │ return result                                            │
│       ▼                                                          │
│  send.js                                                         │
│       │ Detect Buffers → register downloads → add <!L> tags      │
│       │ Serialize with JSS                                       │
│       ▼                                                          │
│  WebSocket Frame → Client                                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Authentication & Authorization

The socket module integrates with the auth system to enforce access control:

### Authorization Middleware

The `authMiddleware.js` module checks tier and permission requirements before controller dispatch:

```js
const { createAuthMiddleware } = require('api-ape/server/socket/authMiddleware');

const authMiddleware = createAuthMiddleware({
  requirements: {
    'admin/*': { tier: 2, permissions: ['admin.access'] },
    'user/*': { tier: 1 },
    'public/*': { tier: 0 }
  },
  defaultTier: 0,
  requireAuthByDefault: false
});
```

### Controller Context

When auth is configured, controllers have access to auth state via `this`:

| Property | Type | Description |
|----------|------|-------------|
| `this.isAuthenticated` | `boolean` | Whether socket is authenticated (Tier ≥ 1) |
| `this.authTier` | `number` | Current tier (0-3) |
| `this.principal` | `object\|null` | User info: `{ userId, roles, permissions }` |
| `this.authState` | `object\|null` | Full auth state object |
| `this.requiresTier(n)` | `function` | Check if socket meets minimum tier |

### Message Flow with Auth

```
┌──────────────────────────────────────────────────────────────────┐
│                      Incoming Message                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WebSocket Frame                                                 │
│       │                                                          │
│       ▼                                                          │
│  receive.js                                                      │
│       │ Parse JSS → { type, data, queryId }                      │
│       │                                                          │
│       │ ── Is auth message? ──────────────────────────────────   │
│       │        │ YES: Route to auth handler (opaque_*, mfa_*)    │
│       │        │ NO: Continue to authorization                   │
│       │        ▼                                                 │
│       │ ── Authorization check ───────────────────────────────   │
│       │        │ FAIL: Return authz_fail                         │
│       │        │ PASS: Continue to controller                    │
│       ▼                                                          │
│  Controller                                                      │
│       │ this = { clientId, isAuthenticated, principal, ... }     │
│       ▼                                                          │
│  send.js → Client                                                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## See Also

- [`../lib/wiring.js`](../lib/wiring.js) — WebSocket connection setup that calls these handlers
- [`../lib/fileTransfer.js`](../lib/fileTransfer.js) — Binary file transfer coordination
- [`../security/README.md`](../security/README.md) — Origin validation used by `open.js`
- [`../security/auth/README.md`](../security/auth/README.md) — Full authentication documentation
- [`tagUtils.js` JSDoc](./tagUtils.js) — Detailed tag system documentation