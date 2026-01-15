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

## Phase 4: Enterprise Adapters ✅ COMPLETED

All Phase 4 items implemented with Passport.js-compatible adapters (57 enterprise adapter tests).

| # | Item | Status | Files |
|---|------|--------|-------|
| 4.1 | LDAP adapter | ✅ Done | `server/security/auth/adapters/ldap.js` |
| 4.2 | LDAP adapter tests | ✅ Done | `server/security/auth/adapters/ldap.test.js` (18 tests) |
| 4.3 | SAML adapter | ✅ Done | `server/security/auth/adapters/saml.js` |
| 4.4 | SAML adapter tests | ✅ Done | `server/security/auth/adapters/saml.test.js` (18 tests) |
| 4.5 | OAuth2 adapter | ✅ Done | `server/security/auth/adapters/oauth2.js` |
| 4.6 | OAuth2 adapter tests | ✅ Done | `server/security/auth/adapters/oauth2.test.js` (21 tests) |
| 4.7 | Adapter registration in framework | ✅ Done | `server/security/auth/index.js` |
| 4.8 | Enterprise adapter docs | ✅ Done | `server/security/auth/adapters/files.md` |

**Implemented Message Types:**
```javascript
// LDAP (Tier 1)
{ type: "ldap_auth", username, password }
{ type: "ldap_auth_ok", userId, profile, tier }
{ type: "ldap_auth_fail", error, message }

// SAML (Tier 1)
{ type: "saml_auth_start" }
{ type: "saml_auth_redirect", url, requestId }
{ type: "saml_auth_callback", SAMLResponse, RelayState }
{ type: "saml_auth_ok", userId, profile }
{ type: "saml_auth_fail", error, message }
{ type: "saml_logout_start", nameId }
{ type: "saml_logout_redirect", url }

// OAuth2 (Tier 1)
{ type: "oauth2_auth_start" }
{ type: "oauth2_auth_redirect", url, state }
{ type: "oauth2_callback", code, state }
{ type: "oauth2_auth_ok", userId, profile, accessToken, refreshToken }
{ type: "oauth2_auth_fail", error, message }
{ type: "oauth2_token_refresh", refreshToken }
{ type: "oauth2_token_refreshed", accessToken, expiresIn }
```

**Passport.js Compatibility:**
All enterprise adapters implement the Passport.js Strategy interface:
- Constructor accepts `(options, verify)` or `(verify)` pattern
- `authenticate(req, options)` method
- Callbacks: `this.success(user, info)`, `this.fail(info)`, `this.error(err)`, `this.redirect(url)`
- Exported as `LDAPStrategy`, `SAMLStrategy`, and `OAuth2Strategy` aliases

---

## Phase 5: 2-of-3 Key Recovery / Tier 3 ✅ COMPLETED

All Phase 5 items implemented with full server-side and client-side SDK (241+ MFA tests passing).

| # | Item | Status | Files |
|---|------|--------|-------|
| **Core SSS Implementation** |||
| 5.1 | Shamir Secret Sharing (SSS) utilities | ✅ Done | `server/security/auth/mfa/sss.js` |
| 5.2 | SSS unit tests | ✅ Done | `server/security/auth/mfa/sss.test.js` (66 tests) |
| **Share Management** |||
| 5.3 | Two-of-three adapter | ✅ Done | `server/security/auth/mfa/two-of-three.js` |
| 5.4 | Two-of-three tests | ✅ Done | `server/security/auth/mfa/two-of-three.test.js` (34 tests) |
| 5.5 | Ledger for share versioning | ✅ Done | `server/security/auth/mfa/ledger.js` |
| 5.6 | Ledger tests | ✅ Done | `server/security/auth/mfa/ledger.test.js` (47 tests) |
| **Recovery Flows** |||
| 5.7 | Key recovery handler | ✅ Done | `server/security/auth/mfa/recovery.js` |
| 5.8 | Recovery tests | ✅ Done | `server/security/auth/mfa/recovery.test.js` (28 tests) |
| **Crypto Utilities** |||
| 5.9 | Server crypto utilities | ✅ Done | `server/security/auth/mfa/crypto-utils.js` |
| 5.10 | Server crypto tests | ✅ Done | `server/security/auth/mfa/crypto-utils.test.js` (66 tests) |
| **Message Handlers** |||
| 5.11 | Key recovery message routing | ✅ Done | `server/security/auth/index.js` |
| 5.12 | HIGH_SECURITY state integration | ✅ Done | `server/security/auth/state-machine-mfa.js` |
| **Client SDK** |||
| 5.13 | Client crypto utilities | ✅ Done | `client/auth/crypto-utils.js` |
| 5.14 | Client IndexedDB storage | ✅ Done | `client/auth/share-storage.js` |
| 5.15 | Client storage tests | ✅ Done | `client/auth/share-storage.test.js` (61 tests) |
| 5.16 | Key recovery client SDK | ✅ Done | `client/auth/key-recovery.js` |
| 5.17 | Client SDK tests | ✅ Done | `client/auth/key-recovery.test.js` (42 tests) |

**Implemented Message Types:**
```javascript
// Enrollment
{ type: "key_recovery_enrollment_start" }
{ type: "key_recovery_enrollment_challenge", challenge, factorRequirements }
{ type: "key_recovery_enrollment_finish", encShares: { S1, S3 }, proof }
{ type: "key_recovery_enrollment_ok" }

// Recovery (Tier 3 elevation)
{ type: "key_recovery_start", factors }
{ type: "key_recovery_shares", encShares: { S1: "...", S3: "..." } }
{ type: "key_recovery_complete", proof }
{ type: "key_recovery_ok", tier: 3 }

// Rotation (device loss)
{ type: "key_recovery_rotation_start", shareId, reason }
{ type: "key_recovery_rotation_ok", shareId, version }
{ type: "key_recovery_cancel" }
{ type: "key_recovery_status" }
```

**Crypto primitives implemented:**
- `SSS.split(secret, threshold, total)` - GF(256) Shamir Secret Sharing
- `SSS.combine(shares)` - Lagrange interpolation
- `AEAD_Encrypt/Decrypt` - AES-256-GCM (Node.js crypto / Web Crypto API)
- `HKDF` - RFC 5869 key derivation
- `Argon2id` - Password-based KDF with PBKDF2 fallback

**Share Distribution:**
| Share | Factor | Storage | Encryption Key |
|-------|--------|---------|----------------|
| S1 | OAuth | Server ledger | `HKDF(oauthToken, salt, "S1_key")` |
| S2 | WebAuthn | Client IndexedDB | `HKDF(authenticatorData, credId, "S2_key")` |
| S3 | TOTP | Server ledger | `Argon2id(totpSeed, salt)` |

**Passport.js Compatibility:**
The two-of-three adapter implements the Passport.js Strategy interface:
- Constructor accepts `(options, verify)` pattern
- `authenticate(req, options)` method
- Callbacks: `this.success(user, info)`, `this.fail(info)`, `this.error(err)`
- Exported as `TwoOfThreeStrategy` alias

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
| `ldapjs` | LDAP authentication | Phase 4 | Mock mode available |
| `passport-saml` or `saml2-js` | SAML authentication | Phase 4 | Mock mode available |
| Pure JS SSS | Shamir Secret Sharing | Phase 5 | ✅ Built-in (GF(256)) |
| `argon2` | KDF for A2F shares | Phase 5 | ✅ With PBKDF2 fallback |
| `fake-indexeddb` | Testing IndexedDB | Phase 5 | ✅ Dev dependency |

---

## Summary

| Phase | Status | Items Done | Items Remaining |
|-------|--------|------------|-----------------|
| Phase 1 | ✅ Complete | 12/12 | 0 |
| Phase 2 | 🟡 Partial | 1/3 | 2 (deferred) |
| Phase 3 | ✅ Complete | 8/8 | 0 |
| Phase 4 | ✅ Complete | 8/8 | 0 |
| Phase 5 | ✅ Complete | 17/17 | 0 |
| Additional | 🟡 Partial | 1/10 | 9 |

**Total completed: 47 items**
**Total remaining: 11 items**

---

## Test Coverage

| Test File | Tests | Status |
|-----------|-------|--------|
| `state-machine.test.js` | 31 | ✅ Pass |
| `opaque.test.js` | 12 | ✅ Pass |
| `webauthn.test.js` | 25 | ✅ Pass |
| `totp.test.js` | 35 | ✅ Pass |
| `ldap.test.js` | 18 | ✅ Pass |
| `saml.test.js` | 18 | ✅ Pass |
| `oauth2.test.js` | 21 | ✅ Pass |
| `index.test.js` | 32 | ✅ Pass |
| **Phase 5 - MFA** |||
| `sss.test.js` | 66 | ✅ Pass |
| `crypto-utils.test.js` | 66 | ✅ Pass |
| `ledger.test.js` | 47 | ✅ Pass |
| `two-of-three.test.js` | 34 | ✅ Pass |
| `recovery.test.js` | 28 | ✅ Pass |
| **Phase 5 - Client** |||
| `share-storage.test.js` | 61 | ✅ Pass |
| `key-recovery.test.js` | 42 | ✅ Pass |
| **Auth Total** | **536** | ✅ Pass |
| **Full Suite** | **1205** | ✅ Pass |

---

## Verification Plan

After each phase, run:
```bash
npm test                    # All tests pass
npm run test:cover          # Coverage maintained/improved
```

For Phase 3+, add browser-based integration tests to verify end-to-end flows.
