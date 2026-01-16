# Authentication Module

## Overview

This module provides a tiered authentication system for api-ape WebSocket connections. It supports OPAQUE-based password authentication where the server never learns raw passwords, with MFA (WebAuthn/TOTP) for elevated security and extensibility for enterprise SSO adapters.

**Key capabilities:**

- **OPAQUE/PAKE authentication** — Password-authenticated key exchange (server never sees raw password)
- **MFA support** — WebAuthn (FIDO2) and TOTP (RFC 6238) for Tier 2 elevation
- **Passport.js compatible** — MFA adapters work with existing Passport.js strategies
- **Tiered security model** — Guest → Basic → Elevated → High Security
- **State machine enforcement** — No-downgrade rule, timeout handling, rate limiting
- **Authorization middleware** — Per-endpoint tier and permission checks
- **Adapter pattern** — Pluggable authentication methods (OPAQUE, WebAuthn, TOTP, LDAP, SAML, OAuth2)

> **Contributing?** See the module files for implementation details.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                     AuthFramework                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Adapter Registry                                             │  │
│  │  - OPAQUE (Tier 1) ✓                                         │  │
│  │  - WebAuthn (Tier 2 MFA) ✓                                   │  │
│  │  - TOTP (Tier 2 MFA) ✓                                       │  │
│  │  - LDAP, SAML, OAuth2 (Tier 1, planned)                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Per-Socket State Machines                                    │  │
│  │  - Tracks auth state per clientId                            │  │
│  │  - Enforces tier requirements                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Message Router                                               │  │
│  │  - Routes auth messages to appropriate adapter               │  │
│  │  - Handles opaque_*, webauthn_*, totp_*, mfa_* messages     │  │
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
  webauthn: {
    rpId: 'example.com',
    rpName: 'My App',
    // Optional: provide credential storage
    getCredentials: async (userId) => db.webauthn.find({ userId }),
    saveCredential: async (userId, credential) => db.webauthn.insertOne({ userId, ...credential })
  },
  totp: {
    issuer: 'My App',
    // Optional: provide secret storage
    getSecret: async (userId) => db.totp.findOne({ userId }),
    saveSecret: async (userId, data) => db.totp.upsertOne({ userId }, data)
  },
  mfaMethods: ['webauthn', 'totp'],
  onAuthSuccess: (clientId, principal) => {
    console.log(`${clientId} authenticated as ${principal.userId}`);
  },
  onMFASuccess: (clientId, principal, method) => {
    console.log(`${clientId} elevated via ${method}`);
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

### OPAQUE Registration (Tier 1)

```
Client                              Server
  |-- opaque_reg_start ----------->|  { user, clientNonce, regRequest }
  |<- opaque_reg_response ---------|  { serverNonce, ts, regResponse }
  |-- opaque_reg_finish ---------->|  { regRecord }
  |<- opaque_reg_ok ---------------|  { msg: "registered" }
```

### OPAQUE Authentication (Tier 1)

```
Client                              Server
  |-- opaque_auth_start ---------->|  { user, clientNonce }
  |<- opaque_auth_1 ---------------|  { serverNonce, ts, envelope, oprfResponse }
  |-- opaque_auth_2 -------------->|  { clientAuth }
  |<- opaque_auth_ok --------------|  { assignedPrincipal, serverProof, tier: 1 }
```

### WebAuthn Registration (MFA Setup)

```
Client                              Server
  |-- webauthn_reg_start --------->|  { userId, userName }
  |<- webauthn_reg_challenge ------|  { challenge, rp, user, pubKeyCredParams }
  |-- webauthn_reg_finish -------->|  { challenge, attestation }
  |<- webauthn_reg_ok -------------|  { credentialId }
```

### WebAuthn Authentication (Tier 2 Elevation)

```
Client                              Server
  |-- webauthn_auth_start -------->|  { userId }
  |<- webauthn_auth_challenge -----|  { challenge, allowCredentials }
  |-- webauthn_auth_finish ------->|  { challenge, assertion }
  |<- webauthn_auth_ok ------------|  { tier: 2 }
```

### TOTP Setup

```
Client                              Server
  |-- totp_setup_start ----------->|  { userId }
  |<- totp_setup_challenge --------|  { secret, otpauthUri }
  |-- totp_setup_verify ---------->|  { code }
  |<- totp_setup_ok ---------------|  { }
```

### TOTP Verification (Tier 2 Elevation)

```
Client                              Server
  |-- totp_verify ---------------->|  { userId, code }
  |<- totp_ok --------------------|  { tier: 2 }
```

### Generic MFA Challenge Flow

```
Client                              Server
  |-- mfa_challenge -------------->|  { }
  |<- mfa_challenge ---------------|  { methods: [{ method: "totp" }, { method: "webauthn", challenge: {...} }] }
  |-- mfa_verify ----------------->|  { method: "totp", code: "123456" }
  |<- mfa_elevated ----------------|  { method: "totp", tier: 2 }
```

## Passport.js Compatibility

Both WebAuthn and TOTP adapters are compatible with Passport.js:

```js
const passport = require('passport');
const { WebAuthnStrategy, TOTPStrategy } = require('api-ape/server/security/auth');

// Use with Passport.js
passport.use('webauthn', new WebAuthnStrategy({
  rpId: 'example.com',
  rpName: 'My App'
}, (user, done) => {
  // Custom verification logic
  done(null, user);
}));

passport.use('totp', new TOTPStrategy({
  issuer: 'My App'
}, (user, done) => {
  // Custom verification logic
  done(null, user);
}));
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
| **TOTP replay protection** | Tracks used counters to prevent code reuse |
| **WebAuthn counter** | Validates and updates authenticator counter |

## File Structure

```
auth/
├── index.js              # Auth framework coordinator
├── index.test.js         # Integration tests (23 tests)
├── state-machine.js      # State transitions, tier management
├── state-machine.test.js # State machine tests (31 tests)
├── nonce-manager.js      # Single-use nonce handling
├── adapters/
│   ├── opaque.js         # OPAQUE/SRP implementation
│   ├── opaque.test.js    # OPAQUE tests (12 tests)
│   ├── webauthn.js       # WebAuthn/FIDO2 adapter (Passport.js compatible)
│   ├── webauthn.test.js  # WebAuthn tests (25 tests)
│   ├── totp.js           # TOTP RFC 6238 adapter (Passport.js compatible)
│   └── totp.test.js      # TOTP tests (35 tests)
└── handlers/
    └── auth-messages.js  # Message routing
```

**Total: 114 tests passing**

## See Also

- [`../README.md`](../README.md) — Security module overview
- [`../../socket/authMiddleware.js`](../../socket/authMiddleware.js) — Authorization middleware
- [`../../socket/receiveContext.js`](../../socket/receiveContext.js) — Controller context with auth
- [`../../../todo/Security.md`](../../../todo/Security.md) — Security architecture design
- [`../../../todo/implementation-checklist.md`](../../../todo/implementation-checklist.md) — Implementation progress
