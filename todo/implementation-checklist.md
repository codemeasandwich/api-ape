# Implementation Checklist for api-ape Unified Authentication Architecture

Based on analysis of [Security.md](Security.md) and the current codebase state.

---

## Phase 1: OPAQUE Foundation ✅ COMPLETED

All Phase 1 items are implemented and tested (31 tests, 700+ total passing).

| Item | Status | File(s) |
|------|--------|---------|
| Auth state machine | ✅ Done | `server/security/auth/state-machine.js` |
| State machine tests | ✅ Done | `server/security/auth/state-machine.test.js` |
| OPAQUE adapter | ✅ Done | `server/security/auth/adapters/opaque.js` |
| OPAQUE tests | ✅ Done | `server/security/auth/adapters/opaque.test.js` |
| Auth framework index | ✅ Done | `server/security/auth/index.js` |
| Auth message handlers | ✅ Done | `server/security/auth/handlers/auth-messages.js` |
| Socket integration | ✅ Done | `server/lib/wiring.js` |
| Controller context | ✅ Done | `server/socket/receiveContext.js` |
| Authorization middleware | ✅ Done | `server/socket/authMiddleware.js` |
| Message routing | ✅ Done | `server/socket/receive.js` |
| Client tracking | ✅ Done | `server/lib/broadcast/clients.js` |
| Documentation | ✅ Done | `server/security/auth/README.md` |

---

## Phase 2: Authorization Integration 🟡 PARTIALLY COMPLETED

| # | Item | Status | Notes |
|---|------|--------|-------|
| 2.1 | Per-message tier checking middleware | ✅ Done | `server/socket/authMiddleware.js` |
| 2.2 | Permission loading from DB after auth | ⬜ Deferred | User provides via `getUser` callback |
| 2.3 | Advanced rate limiting per principal | ⬜ Deferred | Basic lockout exists, per-principal limits not implemented |

---

## Phase 3: MFA / Tier 2 ⬜ NOT STARTED

| # | Item | Status | Files to Create/Modify |
|---|------|--------|------------------------|
| 3.1 | WebAuthn adapter | ⬜ Todo | `server/security/auth/adapters/webauthn.js` |
| 3.2 | WebAuthn adapter tests | ⬜ Todo | `server/security/auth/adapters/webauthn.test.js` |
| 3.3 | TOTP adapter | ⬜ Todo | `server/security/auth/adapters/totp.js` |
| 3.4 | TOTP adapter tests | ⬜ Todo | `server/security/auth/adapters/totp.test.js` |
| 3.5 | MFA challenge/verify handlers | ⬜ Todo | Update `handlers/auth-messages.js` |
| 3.6 | Tier elevation flow in state machine | ⬜ Todo | Update `state-machine.js` (states exist, flows need wiring) |
| 3.7 | MFA configuration options | ⬜ Todo | Update `index.js` framework config |
| 3.8 | MFA integration tests | ⬜ Todo | New test file |

**Message types to implement:**
```javascript
{ type: "mfa_challenge", methods: ["webauthn", "totp"] }
{ type: "mfa_verify", method: "webauthn", assertion: "..." }
{ type: "mfa_elevated", tier: 2 }
```

---

## Phase 4: Enterprise Adapters ⬜ NOT STARTED

| # | Item | Status | Files to Create |
|---|------|--------|-----------------|
| 4.1 | LDAP adapter | ⬜ Todo | `server/security/auth/adapters/ldap.js` |
| 4.2 | LDAP adapter tests | ⬜ Todo | `server/security/auth/adapters/ldap.test.js` |
| 4.3 | SAML adapter | ⬜ Todo | `server/security/auth/adapters/saml.js` |
| 4.4 | SAML adapter tests | ⬜ Todo | `server/security/auth/adapters/saml.test.js` |
| 4.5 | OAuth2 adapter | ⬜ Todo | `server/security/auth/adapters/oauth2.js` |
| 4.6 | OAuth2 adapter tests | ⬜ Todo | `server/security/auth/adapters/oauth2.test.js` |
| 4.7 | Adapter registration in framework | ⬜ Todo | Update `index.js` |
| 4.8 | Enterprise adapter docs | ⬜ Todo | Update `README.md` |

**Message types to implement:**
```javascript
{ type: "ldap_auth", username, password }
{ type: "saml_auth", samlResponse }
{ type: "oauth2_auth", accessToken }
```

---

## Phase 5: 2-of-3 Key Recovery / Tier 3 ⬜ NOT STARTED

| # | Item | Status | Files to Create |
|---|------|--------|-----------------|
| **Core SSS Implementation** |||
| 5.1 | Shamir Secret Sharing (SSS) utilities | ⬜ Todo | `server/security/auth/mfa/sss.js` |
| 5.2 | SSS unit tests | ⬜ Todo | `server/security/auth/mfa/sss.test.js` |
| **Share Management** |||
| 5.3 | Two-of-three adapter | ⬜ Todo | `server/security/auth/mfa/two-of-three.js` |
| 5.4 | Two-of-three tests | ⬜ Todo | `server/security/auth/mfa/two-of-three.test.js` |
| 5.5 | Ledger for share versioning | ⬜ Todo | `server/security/auth/mfa/ledger.js` |
| 5.6 | Ledger tests | ⬜ Todo | `server/security/auth/mfa/ledger.test.js` |
| **Recovery Flows** |||
| 5.7 | Key recovery handler | ⬜ Todo | `server/security/auth/mfa/recovery.js` |
| 5.8 | Recovery tests | ⬜ Todo | `server/security/auth/mfa/recovery.test.js` |
| **Message Handlers** |||
| 5.9 | Key recovery message routing | ⬜ Todo | Update `handlers/auth-messages.js` |
| 5.10 | HIGH_SECURITY state integration | ⬜ Todo | Update `state-machine.js` |
| **Rotation/Revocation** |||
| 5.11 | Share rotation logic | ⬜ Todo | Part of `two-of-three.js` |
| 5.12 | Revocation handling | ⬜ Todo | Part of `ledger.js` |
| 5.13 | Device loss recovery flows | ⬜ Todo | Part of `recovery.js` |

**Message types to implement:**
```javascript
{ type: "key_recovery_start" }
{ type: "key_recovery_shares", encShares: { S1: "...", S3: "..." } }
{ type: "key_recovery_complete" }
{ type: "key_recovery_ok", tier: 3 }
```

**Crypto primitives needed:**
- `SSS.split(secret, threshold, total)`
- `SSS.combine(shares)`
- `AEAD_Encrypt/Decrypt` (XChaCha20-Poly1305 or AES-GCM)
- `HKDF` for key derivation
- `Argon2id` for A2F share KDF

---

## Additional Implementation Items

### Sec-WebSocket-Protocol Enforcement ⬜ NOT STARTED

| # | Item | Status | File |
|---|------|--------|------|
| A.1 | Check `Sec-WebSocket-Protocol: auth` header | ⬜ Todo | `server/lib/wiring.js` |
| A.2 | Close socket with 4001 if auth required but header missing | ⬜ Todo | `server/lib/wiring.js` |

### Session Resumption ⬜ NOT SPECIFIED

| # | Item | Status | Notes |
|---|------|--------|-------|
| B.1 | Server-side session handle storage | ⬜ Todo | Preferred over JWT |
| B.2 | apeSessionToken cookie validation | ⬜ Todo | Mentioned but not specified |
| B.3 | Session revocation on password change | ⬜ Todo | |
| B.4 | Session binding to clientId | ⬜ Todo | |

### Tests for index.js ⬜ MISSING

| # | Item | Status | File |
|---|------|--------|------|
| C.1 | Auth framework coordinator tests | ⬜ Todo | `server/security/auth/index.test.js` |

### Manual/Integration Testing ⬜ NOT DONE

| # | Item | Status | Notes |
|---|------|--------|-------|
| D.1 | Browser client registration flow | ⬜ Todo | Requires client-side OPAQUE lib |
| D.2 | Browser client login flow | ⬜ Todo | End-to-end test |
| D.3 | Protected endpoint access test | ⬜ Todo | Full flow verification |

---

## Recommended Library Dependencies

| Library | Purpose | Phase |
|---------|---------|-------|
| `@cloudflare/opaque` or `opaque-wasm` | OPAQUE protocol | Phase 1 (mock mode available) |
| `@simplewebauthn/server` | WebAuthn verification | Phase 3 |
| `otplib` or `speakeasy` | TOTP generation/verification | Phase 3 |
| `ldapjs` | LDAP authentication | Phase 4 |
| `passport-saml` or `saml2-js` | SAML authentication | Phase 4 |
| `secrets.js` or `shamir` | Shamir Secret Sharing | Phase 5 |
| `argon2` | KDF for A2F shares | Phase 5 |

---

## Summary

| Phase | Status | Items Done | Items Remaining |
|-------|--------|------------|-----------------|
| Phase 1 | ✅ Complete | 12/12 | 0 |
| Phase 2 | 🟡 Partial | 1/3 | 2 (deferred) |
| Phase 3 | ⬜ Not Started | 0/8 | 8 |
| Phase 4 | ⬜ Not Started | 0/8 | 8 |
| Phase 5 | ⬜ Not Started | 0/13 | 13 |
| Additional | ⬜ Not Started | 0/10 | 10 |

**Total remaining work items: 41**

---

## Verification Plan

After each phase, run:
```bash
npm test                    # All tests pass
npm run test:cover          # Coverage maintained/improved
```

For Phase 3+, add browser-based integration tests to verify end-to-end flows.
