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

## Phase 3: MFA / Tier 2 ✅ COMPLETED

All Phase 3 items implemented with Passport.js-compatible adapters (114 total auth tests passing).

| # | Item | Status | Files |
|---|------|--------|-------|
| 3.1 | WebAuthn adapter (Passport.js compatible) | ✅ Done | `server/security/auth/adapters/webauthn.js` |
| 3.2 | WebAuthn adapter tests | ✅ Done | `server/security/auth/adapters/webauthn.test.js` (25 tests) |
| 3.3 | TOTP adapter (Passport.js compatible) | ✅ Done | `server/security/auth/adapters/totp.js` |
| 3.4 | TOTP adapter tests | ✅ Done | `server/security/auth/adapters/totp.test.js` (35 tests) |
| 3.5 | MFA challenge/verify handlers | ✅ Done | `server/security/auth/index.js`, `handlers/auth-messages.js` |
| 3.6 | Tier elevation flow in state machine | ✅ Done | `server/security/auth/index.js` (integrated) |
| 3.7 | MFA configuration options | ✅ Done | `server/security/auth/index.js` (`mfaMethods`, callbacks) |
| 3.8 | MFA integration tests | ✅ Done | `server/security/auth/index.test.js` (23 tests) |

**Implemented Message Types:**
```javascript
// Generic MFA
{ type: "mfa_challenge" }                     // Request available MFA methods
{ type: "mfa_challenge", methods: [...] }     // Response with available methods
{ type: "mfa_verify", method: "totp", code }  // Verify TOTP
{ type: "mfa_verify", method: "webauthn", challenge, assertion }  // Verify WebAuthn
{ type: "mfa_elevated", tier: 2 }             // Success response

// WebAuthn Direct
{ type: "webauthn_reg_start", userId, userName }
{ type: "webauthn_reg_challenge", challenge, rp, user, ... }
{ type: "webauthn_reg_finish", userId, challenge, attestation }
{ type: "webauthn_reg_ok" }
{ type: "webauthn_auth_start", userId }
{ type: "webauthn_auth_challenge", challenge, allowCredentials }
{ type: "webauthn_auth_finish", userId, challenge, assertion }
{ type: "webauthn_auth_ok", tier: 2 }

// TOTP Direct
{ type: "totp_setup_start", userId }
{ type: "totp_setup_challenge", secret, otpauthUri }
{ type: "totp_setup_verify", userId, code }
{ type: "totp_setup_ok" }
{ type: "totp_verify", userId, code }
{ type: "totp_ok", tier: 2 }
{ type: "totp_disable_start", userId, code }
{ type: "totp_disable_ok" }
```

**Passport.js Compatibility:**
Both adapters implement the Passport.js Strategy interface:
- Constructor accepts `(options, verify)` or `(verify)` pattern
- `authenticate(req, options)` method
- Callbacks: `this.success(user, info)`, `this.fail(info)`, `this.error(err)`
- Exported as `WebAuthnStrategy` and `TOTPStrategy` aliases

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

### Tests for index.js ✅ COMPLETED

| # | Item | Status | File |
|---|------|--------|------|
| C.1 | Auth framework coordinator tests | ✅ Done | `server/security/auth/index.test.js` (23 tests) |

### Manual/Integration Testing ⬜ NOT DONE

| # | Item | Status | Notes |
|---|------|--------|-------|
| D.1 | Browser client registration flow | ⬜ Todo | Requires client-side OPAQUE lib |
| D.2 | Browser client login flow | ⬜ Todo | End-to-end test |
| D.3 | Protected endpoint access test | ⬜ Todo | Full flow verification |

---

## Recommended Library Dependencies

| Library | Purpose | Phase | Status |
|---------|---------|-------|--------|
| `@cloudflare/opaque` or `opaque-wasm` | OPAQUE protocol | Phase 1 | Mock mode available |
| `@simplewebauthn/server` | WebAuthn verification | Phase 3 | Mock mode available |
| `otplib` or `speakeasy` | TOTP generation/verification | Phase 3 | Built-in RFC 6238 impl |
| `ldapjs` | LDAP authentication | Phase 4 | Not started |
| `passport-saml` or `saml2-js` | SAML authentication | Phase 4 | Not started |
| `secrets.js` or `shamir` | Shamir Secret Sharing | Phase 5 | Not started |
| `argon2` | KDF for A2F shares | Phase 5 | Not started |

---

## Summary

| Phase | Status | Items Done | Items Remaining |
|-------|--------|------------|-----------------|
| Phase 1 | ✅ Complete | 12/12 | 0 |
| Phase 2 | 🟡 Partial | 1/3 | 2 (deferred) |
| Phase 3 | ✅ Complete | 8/8 | 0 |
| Phase 4 | ⬜ Not Started | 0/8 | 8 |
| Phase 5 | ⬜ Not Started | 0/13 | 13 |
| Additional | 🟡 Partial | 1/10 | 9 |

**Total completed: 22 items**
**Total remaining: 32 items**

---

## Test Coverage

| Test File | Tests | Status |
|-----------|-------|--------|
| `state-machine.test.js` | 31 | ✅ Pass |
| `opaque.test.js` | 12 | ✅ Pass |
| `webauthn.test.js` | 25 | ✅ Pass |
| `totp.test.js` | 35 | ✅ Pass |
| `index.test.js` | 23 | ✅ Pass |
| **Total** | **114** | ✅ Pass |

---

## Verification Plan

After each phase, run:
```bash
npm test                    # All tests pass
npm run test:cover          # Coverage maintained/improved
```

For Phase 3+, add browser-based integration tests to verify end-to-end flows.
