# Security Module

## Overview

This module provides security features to protect api-ape connections from common web vulnerabilities, including Cross-Site Request Forgery (CSRF) protection and duplicate request detection.

**Key capabilities:**

- **Origin validation** — Verify WebSocket connections originate from the same domain
- **CSRF protection** — Automatically reject cross-origin WebSocket requests
- **Replay protection** — Detect and reject duplicate requests within a time window
- **Domain extraction** — Flexible matching for subdomains and complex hostnames

Origin validation is **enabled by default** with no configuration required.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## How CSRF Protection Works

```
┌─────────────────────────────────────────────────────────────┐
│                   WebSocket Upgrade Request                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Headers:                                                   │
│    Host: example.com                                        │
│    Origin: https://example.com                              │
│                                                             │
│  origin.js checks:                                          │
│    1. Extract domain from Host header                       │
│    2. Extract domain from Origin header                     │
│    3. Compare root domains                                  │
│    4. Accept if match, reject if mismatch                   │
│                                                             │
│  ✓ Same origin: example.com === example.com → ALLOWED       │
│  ✗ Cross origin: evil.com !== example.com → REJECTED        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Why Origin Validation Matters

Without origin validation, malicious websites could:

1. Open WebSocket connections to your api-ape server
2. Execute API calls using the victim's session cookies
3. Access or modify data on behalf of authenticated users

Origin validation ensures only your own frontend can establish WebSocket connections.

## Authentication

The security module includes a complete authentication system with:

- **OPAQUE/PAKE authentication** — Password-authenticated key exchange (server never sees raw password)
- **Tiered security model** — Guest → Basic → Elevated → High Security
- **State machine enforcement** — No-downgrade rule, timeout handling, rate limiting
- **Authorization middleware** — Per-endpoint tier and permission checks
- **Adapter pattern** — Pluggable authentication methods

See [`auth/README.md`](auth/README.md) for full documentation.

### Quick Example

```js
const { createAuthFramework } = require('api-ape/server/security/auth');
const { createAuthMiddleware } = require('api-ape/server/socket/authMiddleware');

const authFramework = createAuthFramework({
  opaque: {
    getUser: async (username) => db.users.findOne({ username }),
    saveUser: async (username, data) => db.users.insertOne({ username, ...data })
  }
});

const authMiddleware = createAuthMiddleware({
  requirements: {
    'admin/*': { tier: 2 },  // Admin requires MFA
    'user/*': { tier: 1 },   // User requires auth
    'public/*': { tier: 0 }  // Public allows guests
  }
});

ape(server, { where: 'api', authFramework, authMiddleware });
```

## See Also

- [`auth/README.md`](auth/README.md) — Authentication module documentation
- [`../socket/open.js`](../socket/open.js) — Connection open handler using security
- [`../lib/wiring.js`](../lib/wiring.js) — WebSocket connection setup
- [OWASP CSRF Prevention](https://owasp.org/www-community/attacks/csrf) — CSRF attack documentation