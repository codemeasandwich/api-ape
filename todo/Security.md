# Unified Authentication Architecture Plan for api-ape

## Problem Statement

Two design documents (todo/login.md and todo/Authentication.md) present overlapping and conflicting approaches to authentication. This plan reconciles them into a cohesive unified architecture.

## Requirements Checklist

Before designing an adapter layer for the API framework, these key considerations were evaluated:

1. **Security Requirements**
   - Must support multi-factor or multi-capability flows (like our 2-of-3 scheme)
   - Should separate authentication, authorization, and encryption concerns
   - Must avoid storing raw secrets server-side

2. **Enterprise Integration**
   - Compatibility with LDAP, Active Directory, SAML, OAuth2 providers
   - Single Flow support for LDAP, SAML, OAuth2, email+password, etc.
   - Ability to integrate with enterprise identity management standards

3. **API Abstraction**
   - Adapter should abstract proprietary communication from underlying protocols
   - Must support pluggable flows for various auth mechanisms

4. **Extensibility**
   - Allow new authentication or secret-sharing schemes to be added easily
   - Should not require rewiring of core API logic

5. **Configurability**
   - Engineers must be able to pick which flows are supported, factor thresholds, and device-bound options

6. **Audit & Logging**
   - Must support logging access attempts, rotations, and revocations without exposing sensitive secrets

7. **Developer Experience**
   - Plug-and-play patterns preferred. Minimal boilerplate
   - Clear APIs for registering enterprise adapters and 2-of-3 flows

8. **Compatibility**
   - Node.js runtime support, async-friendly, cross-platform secure storage for WebAuthn / local factors

## Key Insight: These Are Complementary, Not Competing

| Document | Purpose | Output | Trust Model |
|----------|---------|--------|-------------|
| **Authentication.md** (OPAQUE) | Prove identity to server | Server-verified session | Server validates proof |
| **login.md** (2-of-3 MFA) | Reconstruct client-owned key | K_user for client-side decryption | Server cannot learn K_user |

**They operate at different layers:**

```
┌─────────────────────────────────────────────────────────┐
│ Application Layer: 2-of-3 MFA (K_user reconstruction)  │
│ - For client-side encrypted data access                │
├─────────────────────────────────────────────────────────┤
│ Session Layer: OPAQUE/PAKE Authentication              │
│ - Establishes authenticated session, derives K_session │
├─────────────────────────────────────────────────────────┤
│ Transport Layer: TLS (wss://)                          │
└─────────────────────────────────────────────────────────┘
```

## Architectural Decisions

### 1. Tiered Authentication Model

```
Tier 0: GUEST        → No auth, public endpoints only
Tier 1: BASIC        → OPAQUE/SRP or Enterprise SSO (identity verified)
Tier 2: ELEVATED     → Tier 1 + MFA (WebAuthn OR TOTP)
Tier 3: HIGH_SECURITY → Full 2-of-3 for K_user reconstruction
```

### 2. Two Different Keys for Different Purposes

| Key | Source | Purpose | Scope |
|-----|--------|---------|-------|
| K_session | OPAQUE PAKE | Socket binding, replay prevention | Per-connection |
| K_user | 2-of-3 SSS | Client-side data decryption | Per-user |

### 3. OPAQUE as a Factor in 2-of-3

OPAQUE can serve as the "knowledge factor" (S1) in the 2-of-3 scheme:

- S1: OPAQUE-derived share (password → PAKE → export key → decrypt S1)
- S2: WebAuthn-protected share (device-bound)
- S3: TOTP/A2F-protected share (KDF from TOTP seed)

### 2-of-3 Flow Diagrams

#### Account Setup / Enrollment

```
                                    ┌────────────────────┐
                                    │   OAuth2 Provider   │
                                    └─────────┬──────────┘
                                              │
                               OAuth login    │ (identity only)
                                              │
┌──────────────────────┐                      ▼
│      User Device     │<────────── OAuth2_id ──────────────┐
│ (browser / app)      │                                    │
└─────────┬────────────┘                                    │
          │                                                 │
          │  Account Setup                                  │
          │                                                 │
          │--(1) Client generates K_user (random 256b)      │
          │--(2) Split K_user → S1(S_OAuth), S2(S_WebAuthn), S3(S_A2F)
          │--(3) Encrypt each share with factor gating      │
          │       S1 → OAuth-gated (cached key)             │
          │       S2 → WebAuthn-gated (local storage)       │
          │       S3 → A2F-gated (KDF from A2F secret)      │
          │--(4) Store Enc_S1 & Enc_S3 on server / ledger
          │--(5) Store Enc_S2 + wrapped L_key locally
          │--(6) WebAuthn registration (resident key)
```

#### Normal Access Flows

**A) OAuth + A2F**

```
[User Device]                 [OAuth2]                 [Server]
     |                           |                        |
     |-- OAuth login ----------->|                        |
     |<-- OAuth2_id -------------|                        |
     |                                                    |
     |-- Fetch Enc_S1, Enc_S3 --------------------------->|
     |                                                    |
     |-- Decrypt S3 with A2F secret                       |
     |-- Decrypt S1 with cached K_A                       |
     |-- Combine S1 + S3 → K_user                         |
```

**B) WebAuthn + A2F**

```
[User Device]
     |
     |-- WebAuthn assertion (touch / bio)
     |-- Unwrap L_key
     |-- Decrypt S2 (WebAuthn-gated)
     |-- Decrypt S3 (A2F-gated)
     |-- Combine S2 + S3 → K_user
```

**C) OAuth + WebAuthn**

```
[User Device]                 [OAuth2]                 [Server]
     |                           |                        |
     |-- OAuth login ----------->|                        |
     |<-- OAuth2_id -------------|                        |
     |-- Fetch Enc_S1 ----------------------------------->|
     |-- WebAuthn assertion                               |
     |-- Unwrap L_key                                     |
     |-- Decrypt S2                                       |
     |-- Decrypt S1 (cached K_A)                          |
     |-- Combine S1 + S2 → K_user                         |
```

#### Revocation / Rotation Flows

**User lost A2F key:**

```
[User Device]                 [Server]
     |                           |
     |-- Reconstruct K_user using OAuth + WebAuthn
     |-- Generate new share S3_new (A2F-gated)
     |-- Encrypt S3_new with new K_A2F
     |-- Update ledger: mark old S3 as revoked
     |-- Store Enc_S3_new on server / ledger
     |-- User enrolls new A2F device
```

**User lost WebAuthn device:**

```
[User Device]                 [Server]
     |                           |
     |-- Reconstruct K_user using OAuth + A2F
     |-- Generate new share S2_new (WebAuthn-gated)
     |-- Wrap S2_new in new resident WebAuthn credential
     |-- Update local storage with Enc_S2_new + wrapped L_key
     |-- Update ledger metadata: new version
     |-- Mark old S2 as revoked
```

**User rotates OAuth account:**

```
[User Device]                 [OAuth2]                 [Server]
     |                           |                        |
     |-- Reconstruct K_user using WebAuthn + A2F          |
     |-- Generate new share S1_new (OAuth-gated)          |
     |-- Encrypt S1_new with cached K_A                   |
     |-- Update ledger: Enc_S1_new, mark old S1 revoked
     |-- Re-link new OAuth account to ledger
```

### 4. Enterprise Integration via Adapter Pattern (Passport.js-style)

The adapter pattern follows Passport.js strategy conventions for familiarity and plug-and-play integration.

#### AuthAdapter Interface

```typescript
interface AuthAdapter {
  /** Adapter type identifier */
  type: 'opaque' | 'ldap' | 'saml' | 'oauth2' | 'webauthn' | 'totp'

  /** Tier this adapter provides (1 = identity, 2 = MFA factor) */
  tier: 1 | 2

  /** Authenticate credentials, return principal or throw */
  authenticate(credentials: AuthInput): Promise<AuthResult>

  /** For 2-of-3 flow: decrypt a share using this factor */
  decryptShare?(factorInput: FactorInput): Promise<Share>
}

interface AuthInput {
  clientId: string
  user: string
  credentials: Record<string, any>  // Adapter-specific
}

interface AuthResult {
  userId: string
  roles: string[]
  permissions: Record<string, boolean>
}
```

#### Enterprise Adapter Examples

```typescript
// LDAP Adapter
class LDAPAdapter implements AuthAdapter {
  type = 'ldap' as const
  tier = 1 as const

  constructor(public config: { url: string, baseDN: string, bindDN?: string }) {}

  async authenticate({ credentials }: AuthInput): Promise<AuthResult> {
    const { username, password } = credentials
    const user = await ldapBind(this.config.url, username, password)
    return {
      userId: user.dn,
      roles: user.memberOf.map(parseRole),
      permissions: {}
    }
  }
}

// OAuth2 Adapter
class OAuth2Adapter implements AuthAdapter {
  type = 'oauth2' as const
  tier = 1 as const

  constructor(public config: { clientId: string, clientSecret: string, tokenUrl: string }) {}

  async authenticate({ credentials }: AuthInput): Promise<AuthResult> {
    const { accessToken } = credentials
    const userInfo = await fetchUserInfo(accessToken)
    return {
      userId: userInfo.sub,
      roles: userInfo.roles || [],
      permissions: {}
    }
  }
}

// SAML Adapter
class SAMLAdapter implements AuthAdapter {
  type = 'saml' as const
  tier = 1 as const

  constructor(public config: { entryPoint: string, issuer: string, cert: string }) {}

  async authenticate({ credentials }: AuthInput): Promise<AuthResult> {
    const { samlResponse } = credentials
    const assertion = await validateSAMLResponse(samlResponse, this.config)
    return {
      userId: assertion.nameID,
      roles: assertion.attributes.roles || [],
      permissions: {}
    }
  }
}
```

#### TwoOfThreeAdapter (for Tier 3 K_user reconstruction)

```typescript
class TwoOfThreeAdapter implements AuthAdapter {
  type = 'two-of-three' as const
  tier = 3 as const

  constructor(public config: {
    requiredFactors: number        // Default: 2
    allowedFlows: string[]         // e.g., ['WebAuthn+A2F', 'OAuth2+A2F', 'OAuth2+WebAuthn']
    auditEnabled: boolean
    ledgerEndpoint: string
    localStorageOptions?: object
  }) {}

  async decryptClientKey(clientFactors: FactorInput[]): Promise<Uint8Array> {
    // 1. Validate ≥ requiredFactors provided
    if (clientFactors.length < this.config.requiredFactors) {
      throw new AuthError('INSUFFICIENT_FACTORS')
    }

    // 2. Fetch encrypted shares from ledger / local storage
    const shares: Share[] = []
    for (const factor of clientFactors) {
      const encShare = await this.fetchShare(factor)
      const share = await this.decryptShare(factor, encShare)
      shares.push(share)
    }

    // 3. Combine shares via SSS
    const K_user = SSS.combine(shares)

    // 4. Audit log
    if (this.config.auditEnabled) {
      await this.logRecovery(clientFactors)
    }

    return K_user
  }
}
```

#### Framework Registration

```typescript
const authFramework = createAuthFramework()

// Register enterprise adapters (Tier 1)
authFramework.registerAdapter(new LDAPAdapter({ url: 'ldap://corp.example.com' }))
authFramework.registerAdapter(new OAuth2Adapter({ clientId, clientSecret, tokenUrl }))
authFramework.registerAdapter(new SAMLAdapter({ entryPoint, issuer, cert }))

// Register MFA adapters (Tier 2)
authFramework.registerAdapter(new WebAuthnAdapter({ rpId: 'example.com' }))
authFramework.registerAdapter(new TOTPAdapter({ issuer: 'MyApp' }))

// Register 2-of-3 adapter (Tier 3)
authFramework.registerAdapter(new TwoOfThreeAdapter({
  requiredFactors: 2,
  allowedFlows: ['WebAuthn+A2F', 'OAuth2+A2F', 'OAuth2+WebAuthn'],
  auditEnabled: true,
  ledgerEndpoint: '/api/ledger'
}))

// Use in middleware (select which adapters are allowed per endpoint)
api.use(authFramework.middleware(['ldap', 'oauth2']))
```

#### Configuration Options

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `requiredFactors` | `number` | `2` | Threshold for 2-of-3 flow |
| `allowedFlows` | `string[]` | `['*']` | Which factor combinations are permitted |
| `maxRetry` | `number` | `5` | Failed attempts before lockout |
| `auditEnabled` | `boolean` | `true` | Log recovery/rotation events |
| `factorOrder` | `string[]` | `[]` | Preferred order for validating factors |
| `rotationWindow` | `number` | `0` | Auto-rotation schedule (ms, 0 = disabled) |
| `ledgerEndpoint` | `string` | required | URL or storage backend for encrypted shares |
| `localStorageOptions` | `object` | `{}` | Platform-specific WebAuthn/A2F options |

## Unified State Machine

```
INITIAL → GUEST → [OPAQUE_AUTH | ENTERPRISE_AUTH] → AUTHENTICATED (Tier 1)
                                                           │
               ┌───────────────────────────┼───────────────────────────┐
               │                           │                           │
             MFA_PENDING           KEY_RECOVERY_PENDING          (stay Tier 1)
               │                           │
               ▼                           ▼
             ELEVATED (Tier 2)      HIGH_SECURITY (Tier 3)
```

**Rules:**

- No downgrade after authentication
- Higher tiers require completing lower tiers first
- Socket closes on auth failure after timeout

## Message Protocol (Unified)

```javascript
// Tier 1: OPAQUE Authentication
{ type: "opaque_auth_start", clientId, user, clientNonce }
{ type: "opaque_auth_1", serverNonce, envelope, oprfResponse }
{ type: "opaque_auth_2", clientAuth }
{ type: "opaque_auth_ok", assignedPrincipal, serverProof, tier: 1 }

// Tier 2: MFA Elevation
{ type: "mfa_challenge", methods: ["webauthn", "totp"] }
{ type: "mfa_verify", method: "webauthn", assertion: "..." }
{ type: "mfa_elevated", tier: 2 }

// Tier 3: 2-of-3 Key Recovery
{ type: "key_recovery_start" }
{ type: "key_recovery_shares", encShares: { S1: "...", S3: "..." } }
// Client reconstructs K_user locally using any 2 shares
{ type: "key_recovery_complete" }
{ type: "key_recovery_ok", tier: 3 }

// Enterprise (Alternative Tier 1)
{ type: "ldap_auth", username, password }
{ type: "saml_auth", samlResponse }
{ type: "oauth2_auth", accessToken }
```

## Implementation Details & Security Rules

### Sec-WebSocket-Protocol Enforcement

For endpoints requiring authentication at connect time:

1. Server advertises `Sec-WebSocket-Protocol: auth` in upgrade response
2. If client connects without the protocol header and auth is required → close immediately
3. Implementation: check `req.headers['sec-websocket-protocol']` or `ws.protocol`

```javascript
// In wiring.js or upgrade handler
if (requiresAuth && !req.headers['sec-websocket-protocol']?.includes('auth')) {
  socket.close(4001, 'auth_required')
  return
}
```

**Status**: Not yet implemented

### Session Key (K_session) Derivation

OPAQUE derives a shared session key `K` (also called export key) during authentication:

1. **Derivation**: Both client and server independently derive `K` from the OPAQUE transcript
2. **Binding**: `K` is bound to `clientId + clientNonce + serverNonce + user + ts`
3. **Storage**: Server stores `socket.sessionKey` server-side only
4. **Transmission**: `K` is **never sent** over the wire
5. **Usage**:
   - Socket binding (verify subsequent messages if needed)
   - Optional: encrypt application-layer payloads
   - Replay prevention (key is unique per connection)

```javascript
// Server-side after successful auth
socket.sessionKey = opaqueResult.exportKey  // Never expose
socket.sessionKeyDerivedAt = Date.now()
```

### Server Proof (Mutual Authentication)

The `serverProof` field in `opaque_auth_ok` provides mutual authentication:

| Field | Purpose |
|-------|---------|
| `serverProof` | Proves server holds correct OPAQUE envelope for user |

**Flow**:
1. Server sends `serverProof` in `opaque_auth_ok`
2. Client verifies `serverProof` using OPAQUE library
3. If invalid → client should disconnect (server may be impersonator)

**Recommendation**: Always include `serverProof`. While optional in protocol, it defends against server impersonation attacks where attacker has network access but not the user database.

### Session Resumption

If session resumption is needed (reconnecting without full re-auth):

| Approach | Recommendation |
|----------|----------------|
| Server-side session handle | ✅ Preferred |
| Client-held JWT | ❌ Avoid |
| Short-lived revocable token | ⚠️ Acceptable if server-validated |

**Rules**:
1. Session handles must be opaque to client (random bytes, not JWT)
2. Server maintains session state (principal, permissions, expiry)
3. Tokens must be **revocable server-side** (e.g., on password change, admin action)
4. Never trust client-supplied claims for permission decisions
5. Bind session to `clientId` or device fingerprint to prevent session theft

```javascript
// Example: apeSessionToken cookie (server-side validated)
const session = await sessionStore.get(apeSessionToken)
if (!session || session.revoked || session.expiresAt < Date.now()) {
  return { error: 'SESSION_INVALID' }
}
socket.principal = session.principal
```

**Status**: Cookie-based session restoration mentioned in Integration Points but not fully specified

### Auth Timeout Behavior

Authentication must complete within **60 seconds** from `opaque_auth_1`:

| Event | Server Action |
|-------|---------------|
| Timeout during AUTHENTICATING | Revert to GUEST state, clear pending session |
| Timeout during MFA_PENDING | Revert to AUTHENTICATED (Tier 1), clear MFA challenge |
| Timeout during KEY_RECOVERY_PENDING | Revert to ELEVATED (Tier 2), clear recovery state |

```javascript
// Implemented in state-machine.js
setTimeout(() => {
  if (this.state === AUTHENTICATING) {
    this.state = GUEST
    this.clearPendingAuth()
  }
}, AUTH_TIMEOUT_MS)
```

**Policy choice**: Whether to close connection or revert to GUEST depends on endpoint requirements. If `Sec-WebSocket-Protocol: auth` was required, close on timeout.

### Error Message Format

Authentication failures return structured error messages:

```javascript
// Auth failure
{ "type": "opaque_auth_fail", "reason": "invalid_proof" }

// Authorization failure
{ "type": "authz_fail", "reason": "insufficient_tier", "required": 2, "current": 1 }

// Rate limiting
{ "type": "auth_error", "code": "RATE_LIMITED", "retryAfter": 300000 }
```

**Error Codes** (implemented):

| Code | Meaning |
|------|---------|
| `INVALID_TRANSITION` | Invalid state change attempted |
| `AUTH_IN_PROGRESS` | Already authenticating on this socket |
| `ALREADY_AUTHENTICATED` | Cannot restart auth after Tier 1+ |
| `RATE_LIMITED` | Too many failed attempts, locked out |
| `NONCE_EXPIRED` | Server nonce expired (>30s) |
| `NONCE_REUSED` | Attempted replay with used nonce |
| `USER_NOT_FOUND` | Unknown username |
| `INVALID_PROOF` | OPAQUE client proof verification failed |
| `NO_DOWNGRADE` | Cannot transition to lower tier |

### Logging Guidelines

**Do Log**:
- Auth attempts (success/failure) with timestamp, clientId, username, IP
- State transitions (GUEST → AUTHENTICATED, etc.)
- Rate limiting events (lockout triggered, lockout expired)
- Session creation/destruction
- Permission denied events

**Never Log**:
- Passwords or password-derived material
- OPAQUE blobs (regRequest, regRecord, clientAuth, etc.)
- Session keys or export keys
- Nonce values (can aid replay analysis)
- Full error stack traces in production (may leak internal state)

```javascript
// Good
logger.info('auth_success', { clientId, user, tier: 1, ip })
logger.warn('auth_failure', { clientId, user, reason: 'invalid_proof', ip })

// Bad - never do this
logger.debug('auth', { password, clientAuth, sessionKey })
```

### Why Canonical Binding Matters

The canonical binding `clientId|clientNonce|serverNonce|user|ts` serves multiple security purposes:

1. **Replay Prevention**: Same credentials on different connection = different binding = different key
2. **Session Hijacking Prevention**: Attacker can't use captured auth on their own socket
3. **Time Bounding**: `ts` ensures auth is fresh (combined with nonce expiry)
4. **User Binding**: Prevents auth confusion attacks (auth as Alice, claim to be Bob)

**Implementation**:
- Both client and server MUST use identical canonical string
- Include in OPAQUE `context` or `info` parameter for key derivation
- If any component differs, derived keys won't match → auth fails

```javascript
// Both sides compute:
const canonical = `${clientId}|${clientNonce}|${serverNonce}|${user}|${ts}`
const exportKey = opaque.finishAuth(canonical, ...)
```

## Proposed Directory Structure

```
server/security/auth/           (NEW)
├── index.js                    # Auth framework coordinator
├── state-machine.js            # State transitions, tier management
├── adapters/
│   ├── opaque.js              # OPAQUE/SRP (Tier 1)
│   ├── ldap.js                # Enterprise LDAP (Tier 1)
│   ├── saml.js                # Enterprise SAML (Tier 1)
│   ├── oauth2.js              # OAuth2 identity (Tier 1)
│   ├── webauthn.js            # WebAuthn factor (Tier 2/3)
│   └── totp.js                # TOTP/A2F (Tier 2/3)
├── mfa/
│   ├── two-of-three.js        # SSS share management (Tier 3)
│   ├── ledger.js              # Share versioning/revocation
│   └── recovery.js            # Key recovery flows
└── handlers/
    └── auth-messages.js       # Message routing for auth types
```

## Integration Points

### 1. wiring.js Modifications

- Track socket.authState, socket.authTier, socket.principal
- Session restoration from apeSessionToken cookie
- Hook auth state machine into connection lifecycle

### 2. receive.js Modifications

- Route auth message types to auth handlers
- Inject authorization middleware before controller dispatch

### 3. receiveContext.js Modifications

- Expose this.authTier, this.principal, this.isAuthenticated to controllers

### 4. clients.js Modifications

- Store auth state per client for cross-socket authorization checks

## Security Properties Preserved

| Property | Preserved | How |
|----------|-----------|-----|
| Server never learns password | ✅ | OPAQUE/SRP |
| Server cannot reconstruct K_user | ✅ | Client-side SSS combine |
| Single-factor compromise safe | ✅ | 2-of-3 requires 2 factors |
| No auth downgrade | ✅ | State machine enforces |
| Replay protection | ✅ | Nonces + timestamps |
| Device-bound factors | ✅ | WebAuthn resident credentials |

## Threat Model

### Adversary Capabilities

1. **Server compromise**
   - Adversary can read server storage (Enc_S1, Enc_S3, ledger, metadata)
   - Cannot access client local storage (WebAuthn-protected Enc_S2)
   - Cannot forge WebAuthn assertions (assume secure authenticator)

2. **OAuth compromise**
   - Adversary can authenticate via OAuth
   - Cannot access local device secrets (WebAuthn / A2F)

3. **A2F compromise**
   - Adversary has stolen the TOTP seed or hardware key
   - Cannot access WebAuthn device / local encrypted S2

4. **WebAuthn device compromise**
   - Adversary has stolen/resident authenticator
   - Cannot access OAuth login or A2F

5. **Network attacker**
   - Can eavesdrop TLS connections
   - Cannot break TLS

6. **Client device compromise (partial)**
   - If browser is fully compromised (XSS, malware), client secrets may leak
   - Mitigation: platform secure storage, WebAuthn resident credentials, AEAD per share

### Security Goals

| Goal | Description |
|------|-------------|
| **G1** | K_user only reconstructable with ≥2 independent factors |
| **G2** | Server cannot reconstruct K_user |
| **G3** | Compromise of any single factor ≠ full account compromise |
| **G4** | Ledger / backup compromise ≠ full account compromise |
| **G5** | Device-bound factors (WebAuthn) protect S2 even if server / network is compromised |
| **G6** | System supports revocation and rotation without full loss of access |

## Implementation Phases (Prioritized)

### Phase 1: OPAQUE Foundation ✅ COMPLETED

**Goal**: Establish Tier 1 authentication with OPAQUE/PAKE

1. **Auth state machine** ✅ `server/security/auth/state-machine.js`
   - States: GUEST → AUTHENTICATING → AUTHENTICATED → MFA_PENDING → ELEVATED
   - No-downgrade enforcement
   - Timeout handling for incomplete auth
   - Nonce generation and consumption
   - Rate limiting with lockout
   - 19 unit tests passing

2. **OPAQUE adapter** ✅ `server/security/auth/adapters/opaque.js`
   - Registration flow: opaque_reg_start → opaque_reg_response → opaque_reg_finish → opaque_reg_ok
   - Login flow: opaque_auth_start → opaque_auth_1 → opaque_auth_2 → opaque_auth_ok
   - Canonical binding: `clientId|clientNonce|serverNonce|user|ts`
   - Nonce management (single-use, 30s expiry)
   - Works with or without OPAQUE library (mock mode for development)
   - 12 unit tests passing

3. **Socket integration** ✅ `server/lib/wiring.js`
   - Added `options` parameter with `authFramework` and `authMiddleware`
   - Creates per-socket auth state machine via `authFramework.createSocketAuth(clientId)`
   - Cleans up auth resources on disconnect
   - Auth state accessible via `ape.clients.get(clientId).authState`

4. **Controller context** ✅ `server/socket/receiveContext.js`
   - `this.isAuthenticated` - boolean
   - `this.authTier` - number (0-3)
   - `this.principal` - { userId, roles, permissions }
   - `this.authState` - full auth state object
   - `this.requiresTier(n)` - check minimum tier

5. **Authorization middleware** ✅ `server/socket/authMiddleware.js`
   - Per-endpoint tier requirements with wildcard support
   - Permission checking with wildcards
   - Role checking
   - Returns `{ type: "authz_fail", reason }` on unauthorized access

6. **Auth message routing** ✅ `server/security/auth/handlers/auth-messages.js`
   - Routes auth messages (opaque_*, mfa_*, key_recovery_*) to handlers
   - Integrated into `server/socket/receive.js`

7. **Client tracking** ✅ `server/lib/broadcast/clients.js`
   - `client.authState` - get auth state
   - `client.isAuthenticated` - boolean
   - `client.authTier` - number (0-3)

8. **Documentation** ✅
   - `server/security/auth/README.md` - full auth module docs
   - Updated `server/security/README.md`, `server/socket/README.md`, `server/README.md`, `README.md`

**All 700 tests passing** (669 original + 31 new auth tests)

### Phase 2: Authorization Integration ✅ PARTIALLY COMPLETED

- ✅ Per-message tier checking middleware
- ⬜ Permission loading from DB after authentication (deferred - user provides via getUser)
- ⬜ Rate limiting per principal (basic lockout implemented, advanced rate limiting deferred)

### Phase 3: MFA/Tier 2 (FUTURE)

- WebAuthn adapter
- TOTP adapter
- Tier elevation flow

### Phase 4: Enterprise Adapters (FUTURE)

- LDAP, SAML, OAuth2 adapters
- Pluggable via adapter pattern established in Phase 1

### Phase 5: 2-of-3 Key Recovery (FUTURE ENHANCEMENT)

- SSS implementation for K_user
- Ledger for share versioning
- Recovery/rotation flows
- Can use OPAQUE export key as S1 factor

## Verification Plan (Phase 1) ✅

1. ✅ **Unit tests** for auth state machine transitions (19 tests)
2. ✅ **Integration test**: Complete OPAQUE registration flow (opaque.test.js)
3. ✅ **Integration test**: Complete OPAQUE login flow (opaque.test.js)
4. ✅ **Security test**: Verify no-downgrade (state-machine.test.js "cannot downgrade from authenticated")
5. ✅ **Security test**: Nonce expiry and replay rejection (state-machine.test.js nonce tests)
6. ✅ **Security test**: Rate limiting on auth attempts (state-machine.test.js lockout tests)
7. ⬜ **Manual test**: Browser client registration → login → access protected endpoint (requires client-side OPAQUE lib)

## Files Created/Modified (Phase 1) ✅

**New Files:**

- ✅ `server/security/auth/index.js` - Auth framework coordinator
- ✅ `server/security/auth/state-machine.js` - State transitions
- ✅ `server/security/auth/state-machine.test.js` - 19 unit tests
- ✅ `server/security/auth/adapters/opaque.js` - OPAQUE implementation
- ✅ `server/security/auth/adapters/opaque.test.js` - 12 unit tests
- ✅ `server/security/auth/handlers/auth-messages.js` - Message routing
- ✅ `server/socket/authMiddleware.js` - Authorization checks
- ✅ `server/security/auth/README.md` - Module documentation

**Modified Files:**

- ✅ `server/lib/wiring.js` - Add auth state tracking, 4th options param
- ✅ `server/socket/receive.js` - Route auth messages, inject authz middleware
- ✅ `server/socket/receiveContext.js` - Expose auth state to controllers
- ✅ `server/lib/broadcast/clients.js` - Store auth state per client
- ✅ `server/lib/broadcast/index.js` - Export updateClientAuth

## Crypto Primitives

```js
// Crypto primitives required for full implementation
Argon2id(password, salt)            // KDF for A2F share
SSS.split(secret, threshold, total) // Split K_user into shares
SSS.combine(shares)                 // Combine shares to reconstruct
AEAD_Encrypt(key, plaintext, aad)   // XChaCha20-Poly1305 / AES-GCM
AEAD_Decrypt(key, ciphertext, aad)
HKDF(inputKeyMaterial, salt, info, length)
crypto.getRandomValues(bytes)        // Secure RNG
indexedDB.store(key, obj)            // Local secure storage
indexedDB.load(key)                  // Load local data
navigator.credentials.create()/get() // WebAuthn
```

## Ledger Metadata Schema

To support rotation and revocation:

```json
{
  "user_id": "...",
  "shares": [
    {
      "id": "S1",
      "factor": "OAuth",
      "Enc_share": "...",
      "version": 3,
      "revoked": false,
      "created_at": "2026-01-11T00:00:00Z"
    },
    {
      "id": "S2",
      "factor": "WebAuthn",
      "Enc_share": "...",
      "version": 3,
      "revoked": false,
      "created_at": "2026-01-11T00:00:00Z"
    },
    {
      "id": "S3",
      "factor": "A2F",
      "Enc_share": "...",
      "version": 3,
      "revoked": true,
      "created_at": "2026-01-10T00:00:00Z"
    }
  ]
}
```

- `version` → allows rotation
- `revoked` → marks lost/compromised shares
- Factor IDs → locate / reconstruct per client factor

## Implementation Pseudo-code (2-of-3 Flow)

### Account Setup / Enrollment

```js
// 1. OAuth login → OAuth2_id (identity only)
const OAuth2_id = oauthLogin(); // used as lookup only

// 2. Generate K_user
const K_user = crypto.getRandomValues(new Uint8Array(32)); // 256b

// 3. Split into 3 shares (2-of-3)
const [S1, S2, S3] = SSS.split(K_user, 2, 3);

// 4. Encrypt shares per factor
// OAuth-gated (S1) - client caches K_A locally
const K_A = crypto.getRandomValues(new Uint8Array(32));
const Enc_S1 = AEAD_Encrypt(K_A, S1, "S1_OAuth_v1");

// WebAuthn-gated (S2)
const L_key = crypto.getRandomValues(new Uint8Array(32));
const Enc_S2 = AEAD_Encrypt(L_key, S2, "S2_WebAuthn_v1");

// Wrap L_key via WebAuthn
const webAuthnCred = await navigator.credentials.create({
  publicKey: {
    rp: { name: "Example" },
    user: { id: user_id_bytes, name: email, displayName: email },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    timeout: 60000
  }
});

// Derive wrapping key from attestation/authenticator data
const wrap_key = HKDF(SHA256(webAuthnCred.response.authenticatorData),
                      SHA256(webAuthnCred.rawId),
                      "L_key_wrap_v1", 32);
const Wrapped_L_key = AEAD_Encrypt(wrap_key, L_key, "wrap_L_key_v1");

// Store WebAuthn-gated share locally
indexedDB.store("S2_store", { Enc_S2, Wrapped_L_key, credential_id: webAuthnCred.rawId });

// A2F-gated (S3)
const K_A2F = Argon2id(A2F_secret, salt_a2f);
const Enc_S3 = AEAD_Encrypt(K_A2F, S3, "S3_A2F_v1");

// 5. Upload server / ledger (blind)
server.store(user_id, { Enc_S1, Enc_S3, metadata: { version: 1 }});
```

### Normal Account Recovery / Access

```js
// Choose 2 factors, e.g., WebAuthn + A2F

// 2a. WebAuthn assertion → unwrap L_key
const challenge = await fetch("/webauthn/challenge").then(r => r.arrayBuffer());
const assertion = await navigator.credentials.get({ publicKey: { challenge, userVerification: "required" }});

const wrap_key = HKDF(SHA256(assertion.response.authenticatorData),
                      SHA256(assertion.rawId),
                      "L_key_wrap_v1", 32);

const { Enc_S2, Wrapped_L_key } = indexedDB.load("S2_store");
const L_key = AEAD_Decrypt(wrap_key, Wrapped_L_key, "wrap_L_key_v1");

// 2b. Decrypt S2
const S2 = AEAD_Decrypt(L_key, Enc_S2, "S2_WebAuthn_v1");

// 2c. Decrypt S3
const K_A2F = Argon2id(A2F_secret, salt_a2f);
const Enc_S3 = server.fetchEncS3(user_id);
const S3 = AEAD_Decrypt(K_A2F, Enc_S3, "S3_A2F_v1");

// 2d. Combine any 2 shares → K_user
const K_user = SSS.combine([S2, S3]);

// 2e. Use K_user to decrypt user data
const Enc_user_data = server.fetchEncUserData(user_id);
const user_data = AEAD_Decrypt(K_user, Enc_user_data, "user_data_v1");
```

### Rotation / Revocation

```js
// 3a. Reconstruct K_user using any 2 valid factors
const K_user = reconstructKUser([factor1, factor2]);

// 3b. Generate new shares (optionally new K_user)
const [S1_new, S2_new, S3_new] = SSS.split(K_user, 2, 3);

// 3c. Encrypt new shares
const Enc_S1_new = AEAD_Encrypt(K_A_new, S1_new,   "S1_OAuth_v2");
const Enc_S2_new = AEAD_Encrypt(L_key_new, S2_new, "S2_WebAuthn_v2");
const Enc_S3_new = AEAD_Encrypt(K_A2F_new, S3_new, "S3_A2F_v2");

// 3d. Update server / ledger
server.updateShares(user_id, {
    Enc_S1: Enc_S1_new,
    Enc_S2: Enc_S2_new,
    Enc_S3: Enc_S3_new,
    metadata: { version: 2, revoked: ["S1", "S2", "S3"] }
});

// 3e. Update local storage (WebAuthn / wrapped L_key)
indexedDB.store("S2_store", { Enc_S2: Enc_S2_new, Wrapped_L_key: Wrapped_L_key_new, credential_id: new_cred_id });

// 3f. Mark old shares as revoked in ledger metadata
```

### Device Loss Handling

```js
// Lost WebAuthn device:
// 1. Reconstruct K_user via OAuth + A2F
// 2. Generate new S2_new share
// 3. Encrypt S2_new locally, wrap with new WebAuthn credential
// 4. Update ledger metadata (version increment, revoke old S2)

// Lost A2F device:
// 1. Reconstruct K_user via OAuth + WebAuthn
// 2. Generate new S3_new share
// 3. Encrypt S3_new with new A2F device/seed
// 4. Update ledger metadata (version increment, revoke old S3)

// Lost OAuth account:
// 1. Reconstruct K_user via WebAuthn + A2F
// 2. Generate new S1_new share
// 3. Encrypt S1_new with cached local key (K_A)
// 4. Update ledger metadata (version increment, revoke old S1)
// 5. Re-link new OAuth account to ledger
```

## Adapter Integration Requirements

1. **Implementation of AuthAdapter interface**
   - Must implement `authenticate()` for enterprise adapters
   - Must implement `decryptShare()` for 2-of-3 flows

2. **Pluggable configuration**
   - Can register multiple adapters for different endpoints / user types

3. **Factor input validation**
   - Client must supply correct factor data structure
   - Adapter validates factor authenticity (WebAuthn signature, TOTP code, etc.)

4. **Ledger / local storage access**
   - 2-of-3 adapter must be able to fetch encrypted shares from server or client local storage

5. **Audit hooks**
   - Rotation and revocation events must trigger hooks or logs

6. **Error handling**
   - Adapter should clearly return `AuthError` with factor info if decryption fails
   - Must not leak sensitive info (like partial shares)

## Library Recommendation

For OPAQUE implementation, consider:

- @cloudflare/opaque - Well-maintained, TypeScript support
- opaque-wasm - WASM-based, cross-platform

For future SSS (Phase 5):

- secrets.js - Simple Shamir implementation
- shamir - More modern, typed
