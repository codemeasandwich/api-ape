# Authentication Module

## Overview

This module provides a tiered authentication system for api-ape WebSocket connections. It supports OPAQUE-based password authentication where the server never learns raw passwords, with extensibility for MFA and enterprise SSO adapters.

**Key capabilities:**

- **OPAQUE/PAKE authentication** — Password-authenticated key exchange (server never sees raw password)
- **Tiered security model** — Guest → Basic → Elevated → High Security
- **State machine enforcement** — No-downgrade rule, timeout handling, rate limiting
- **Authorization middleware** — Per-endpoint tier and permission checks
- **Adapter pattern** — Pluggable authentication methods (OPAQUE, LDAP, SAML, OAuth2, WebAuthn, TOTP)

> **Contributing?** See the module files for implementation details.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                     AuthFramework                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Adapter Registry                                             │  │
│  │  - OPAQUE (Tier 1) ✓                                         │  │
│  │  - LDAP, SAML, OAuth2 (Tier 1, future)                       │  │
│  │  - WebAuthn, TOTP (Tier 2, future)                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Per-Socket State Machines                                    │  │
│  │  - Tracks auth state per clientId                            │  │
│  │  - Enforces tier requirements                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Message Router                                               │  │
│  │  - Routes auth messages to appropriate adapter               │  │
│  │  - Handles opaque_*, mfa_*, key_recovery_* message types     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

## Authentication Tiers

| Tier | Name | Description |
|------|------|-------------|
| 0 | GUEST | Unauthenticated, public endpoints only |
| 1 | BASIC | Identity verified via OPAQUE/SRP or enterprise SSO |
| 2 | ELEVATED | Tier 1 + MFA (WebAuthn or TOTP) |
| 3 | HIGH_SECURITY | Full 2-of-3 scheme for client-side key reconstruction |

## Quick Start

### 1. Create the Auth Framework

```js
const { createAuthFramework } = require('api-ape/server/security/auth');
const { createAuthMiddleware } = require('api-ape/server/socket/authMiddleware');

const authFramework = createAuthFramework({
  opaque: {
    // Provide your user storage functions
    getUser: async (username) => db.users.findOne({ username }),
    saveUser: async (username, data) => db.users.insertOne({ username, ...data })
  },
  onAuthSuccess: (clientId, principal) => {
    console.log(`${clientId} authenticated as ${principal.userId}`);
  }
});
```

### 2. Configure Authorization Rules

```js
const authMiddleware = createAuthMiddleware({
  requirements: {
    'admin/*': { tier: 2 },           // Admin endpoints require MFA
    'user/*': { tier: 1 },            // User endpoints require auth
    'public/*': { tier: 0 }           // Public endpoints allow guests
  },
  defaultTier: 0
});
```

### 3. Pass to ape()

```js
const { ape } = require('api-ape');

ape(server, {
  where: 'api',
  authFramework,      // Enable authentication
  authMiddleware      // Enable authorization
});
```

## Message Protocol

### OPAQUE Registration

```
Client                              Server
  |-- opaque_reg_start ----------->|  { user, clientNonce, regRequest }
  |<- opaque_reg_response ---------|  { serverNonce, ts, regResponse }
  |-- opaque_reg_finish ---------->|  { regRecord }
  |<- opaque_reg_ok ---------------|  { msg: "registered" }
```

### OPAQUE Authentication

```
Client                              Server
  |-- opaque_auth_start ---------->|  { user, clientNonce }
  |<- opaque_auth_1 ---------------|  { serverNonce, ts, envelope, oprfResponse }
  |-- opaque_auth_2 -------------->|  { clientAuth }
  |<- opaque_auth_ok --------------|  { assignedPrincipal, serverProof, tier: 1 }
```

## Controller Context

After authentication, controllers have access to auth state via `this`:

```js
// api/protected/data.js
module.exports = function(query) {
  // Check authentication
  if (!this.isAuthenticated) {
    throw new Error('Authentication required');
  }

  // Access user info
  console.log('User:', this.principal.userId);
  console.log('Roles:', this.principal.roles);
  console.log('Tier:', this.authTier);

  // Check tier requirement
  if (!this.requiresTier(2)) {
    throw new Error('MFA required for this operation');
  }

  return { data: 'sensitive info' };
};
```

### Available Properties

| Property | Type | Description |
|----------|------|-------------|
| `this.isAuthenticated` | `boolean` | Whether socket is authenticated (Tier ≥ 1) |
| `this.authTier` | `number` | Current tier (0-3) |
| `this.principal` | `object\|null` | User info: `{ userId, roles, permissions }` |
| `this.authState` | `object\|null` | Full auth state object |
| `this.requiresTier(n)` | `function` | Check if socket meets minimum tier |

## Client Tracking

Query auth state for any connected client:

```js
const client = this.clients.get(targetClientId);

if (client.isAuthenticated) {
  console.log('User:', client.authState.principal.userId);
  console.log('Tier:', client.authTier);
}
```

## State Machine

```
GUEST → AUTHENTICATING → AUTHENTICATED (Tier 1)
                               │
               ┌───────────────┼───────────────┐
               │               │               │
         MFA_PENDING    KEY_RECOVERY     (stay Tier 1)
               │               │
               ▼               ▼
         ELEVATED (2)   HIGH_SECURITY (3)
```

**Rules:**

- No downgrade after authentication
- Higher tiers require completing lower tiers first
- Auth timeout closes incomplete sessions
- Rate limiting and lockout after failed attempts

## Security Features

| Feature | Description |
|---------|-------------|
| **Password protection** | OPAQUE ensures server never sees raw password |
| **Replay prevention** | Single-use nonces with 30s expiry |
| **No-downgrade** | Cannot return to lower tier after auth |
| **Rate limiting** | Lockout after configurable failed attempts |
| **Session binding** | Auth bound to `clientId + nonces + timestamp` |

## File Structure

```
auth/
├── index.js              # Auth framework coordinator
├── state-machine.js      # State transitions, tier management
├── adapters/
│   └── opaque.js         # OPAQUE/SRP implementation
└── handlers/
    └── auth-messages.js  # Message routing
```

## See Also

- [`../README.md`](../README.md) — Security module overview
- [`../../socket/authMiddleware.js`](../../socket/authMiddleware.js) — Authorization middleware
- [`../../socket/receiveContext.js`](../../socket/receiveContext.js) — Controller context with auth
- [`../../../todo/Authentication.md`](../../../todo/Authentication.md) — OPAQUE protocol design
- [`../../../todo/login.md`](../../../todo/login.md) — 2-of-3 MFA design (future)
