# 1) Considerations

Before designing an adapter layer for your API framework, several key considerations must be evaluated:

1. **Security Requirements**

   * Must support multi-factor or multi-capability flows (like our 2-of-3 scheme).
   * Should separate authentication, authorization, and encryption concerns.
   * Must avoid storing raw secrets server-side.

2. **Enterprise Integration**

   * Compatibility with LDAP, Active Directory, SAML, OAuth2 providers.
   * Single Flow support for LDAP, SAML, OAuth2, email+password, etc..
   * Ability to integrate with enterprise identity management standards.

3. **API Abstraction**

   * Adapter should abstract proprietary communication from underlying protocols.
   * Must support pluggable flows for various auth mechanisms.

4. **Extensibility**

   * Allow new authentication or secret-sharing schemes to be added easily.
   * Should not require rewiring of core API logic.

5. **Configurability**

   * Engineers must be able to pick which flows are supported, factor thresholds, and device-bound options.

6. **Audit & Logging**

   * Must support logging access attempts, rotations, and revocations without exposing sensitive secrets.

7. **Developer Experience**

   * Plug-and-play patterns preferred. Minimal boilerplate.
   * Clear APIs for registering enterprise adapters and 2-of-3 flows.

8. **Compatibility**

   * Node.js runtime support, async-friendly, cross-platform secure storage for WebAuthn / local factors.

---

Showing **revocation, rotation, and recovery flows** for the 2-of-3 scheme. It includes how old shares are replaced, how new factors are enrolled, and how K_user stays reconstructable with any 2 valid factors.

---

## 2-of-3 Scheme — Revocation & Rotation Flows

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
─────────────────────────────────────────────────────────────────────────

                            NORMAL ACCESS FLOWS
─────────────────────────────────────────────────────────────────────────

A) OAuth + A2F
─────────────
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

B) WebAuthn + A2F
────────────────
[User Device]
     |
     |-- WebAuthn assertion (touch / bio)
     |-- Unwrap L_key
     |-- Decrypt S2 (WebAuthn-gated)
     |-- Decrypt S3 (A2F-gated)
     |-- Combine S2 + S3 → K_user

C) OAuth + WebAuthn
──────────────────
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

─────────────────────────────────────────────────────────────────────────
                           REVOCATION / ROTATION
─────────────────────────────────────────────────────────────────────────

User lost A2F key
────────────────
[User Device]                 [Server]               
     |                           |
     |-- Reconstruct K_user using OAuth + WebAuthn
     |-- Generate new share S3_new (A2F-gated)
     |-- Encrypt S3_new with new K_A2F
     |-- Update ledger: mark old S3 as revoked
     |-- Store Enc_S3_new on server / ledger
     |-- User enrolls new A2F device

User lost WebAuthn device
──────────────────────
[User Device]                 [Server]               
     |                           |
     |-- Reconstruct K_user using OAuth + A2F
     |-- Generate new share S2_new (WebAuthn-gated)
     |-- Wrap S2_new in new resident WebAuthn credential
     |-- Update local storage with Enc_S2_new + wrapped L_key
     |-- Update ledger metadata: new version
     |-- Mark old S2 as revoked

User rotates OAuth account
────────────────────────
[User Device]                 [OAuth2]                 [Server]               
     |                           |                        |
     |-- Reconstruct K_user using WebAuthn + A2F          |
     |-- Generate new share S1_new (OAuth-gated)          |
     |-- Encrypt S1_new with cached K_A                   |
     |-- Update ledger: Enc_S1_new, mark old S1 revoked
     |-- Re-link new OAuth account to ledger

─────────────────────────────────────────────────────────────────────────
                            KEY PROPERTIES
─────────────────────────────────────────────────────────────────────────

- K_user remains reconstructable with **any 2 valid factors**
- Server stores **encrypted shares only** + ledger metadata
- Old shares can be **revoked or rotated** without breaking access
- Multi-device support requires re-enrollment for lost WebAuthn or A2F
- Single-factor compromise ≠ account compromise
```

---

### ✅ Notes

1. Ledger keeps **version + revoked flags** to prevent reuse of old shares.
2. Rotation always starts by reconstructing K_user using **remaining valid factors**.
3. Device loss is handled by generating a **new share** for the lost factor.
4. All encrypted shares remain **factor-gated**, never sent in plaintext.

---

Here’s a **formalized threat model** for the 2-of-3 scheme, plus guidance for **revocation, rotation, and device loss handling**. I’ll keep it precise and actionable.

---

## 1) Formal Threat Assumptions

### 1.1 Adversary capabilities

1. **Server compromise**

   * Adversary can read server storage (Enc_S1, Enc_S3, ledger, metadata)
   * Cannot access client local storage (WebAuthn-protected Enc_S2)
   * Cannot forge WebAuthn assertions (assume secure authenticator)

2. **OAuth compromise**

   * Adversary can authenticate via OAuth
   * Cannot access local device secrets (WebAuthn / A2F)

3. **A2F compromise**

   * Adversary has stolen the TOTP seed or hardware key
   * Cannot access WebAuthn device / local encrypted S2

4. **WebAuthn device compromise**

   * Adversary has stolen/resident authenticator
   * Cannot access OAuth login or A2F

5. **Network attacker**

   * Can eavesdrop TLS connections
   * Cannot break TLS

6. **Client device compromise (partial)**

   * If browser is fully compromised (XSS, malware), client secrets may leak
   * Mitigation: platform secure storage, WebAuthn resident credentials, AEAD per share

---

### 1.2 Security goals

* **G1:** K_user only reconstructable with ≥2 independent factors
* **G2:** Server cannot reconstruct K_user
* **G3:** Compromise of any single factor ≠ full account compromise
* **G4:** Ledger / backup compromise ≠ full account compromise
* **G5:** Device-bound factors (WebAuthn) protect S2 even if server / network is compromised
* **G6:** System supports revocation and rotation without full loss of access

---

## 2) Revocation / Rotation / Device Loss Handling

### 2.1 Revocation

#### Use case: user loses an A2F key or device

* **Goal:** invalidate lost factor without breaking access for remaining factors
* **Mechanism:** issue **new shares** for the affected factor

  1. Client reconstructs K_user using any other valid 2 factors
  2. Generate new SSS split → new shares S1', S2', S3'
  3. Re-encrypt shares with their respective factors
  4. Replace old shares in server / local storage
  5. Update ledger metadata with **version + revocation flags**
  6. Mark old factor shares as **revoked**
* This ensures lost factor cannot be used to reconstruct old K_user

---

### 2.2 Rotation

#### Use case: periodic security rotation

* **Goal:** rotate K_user / shares proactively
* **Mechanism:** similar to revocation

  1. Generate new K_user' (optional) or keep old K_user and re-share
  2. Generate new 2-of-3 shares
  3. Re-encrypt per factor
  4. Store new shares, versioned in ledger
  5. Keep old shares for audit or revoke immediately

> Versioned ledger entries allow rotation **without breaking access** for remaining factors

---

### 2.3 Device Loss / Recovery

#### Lost WebAuthn device

1. User still has OAuth + A2F
2. Use these 2 factors to reconstruct K_user
3. Re-enroll new WebAuthn device:

   * Generate new share S2_new
   * Protect S2_new locally with new WebAuthn resident key
   * Update ledger / local mapping

#### Lost A2F key

1. User still has OAuth + WebAuthn
2. Reconstruct K_user
3. Generate new share S3_new
4. Protect S3_new with new A2F device / TOTP seed
5. Update server / ledger

#### Lost OAuth account

* Only possible if WebAuthn + A2F exist → recover K_user
* Re-link new OAuth account to ledger, update metadata

> Key principle: **never rely on single-factor recovery**
> Ledger stores blinded shares, server cannot issue K_user without ≥2 valid factors

---

### 2.4 Ledger metadata

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

* `version` → allows rotation
* `revoked` → marks lost/compromised shares
* Factor IDs → locate / reconstruct per client factor

---

### 2.5 Operational guidelines

* Always require **≥2 independent factors** to decrypt K_user
* Do **not store factor secrets** server-side
* Rotation / revocation should **only happen after successful 2-factor reconstruction**
* Keep ledger **immutable audit trail** for troubleshooting / compliance
* Encourage **periodic recovery drill**: ensure user can reconstruct K_user from remaining factors

---

This setup now satisfies:

1. **Formal threat assumptions**
2. **Single-factor compromise resistance**
3. **Device loss and rotation flows**
4. **Ledger versioning for revocation / rotation**

---

Perfect — here’s a **complete pseudo-code blueprint** for the 2-of-3 scheme, including **recovery, revocation, and rotation**. This assumes:

* Client-only decryption
* 2-of-3 secret sharing (SSS)
* WebAuthn-gated local storage
* A2F-gated encryption
* OAuth for lookup only

I’ll keep it detailed and step-by-step.

---

## 0️⃣ Primitives / Libraries

```js
// Crypto primitives
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

---

## 1️⃣ Account Setup / Enrollment

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

---

## 2️⃣ Normal Account Recovery / Access

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

> Same pattern applies if using OAuth + A2F or OAuth + WebAuthn

---

## 3️⃣ Rotation / Revocation

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

---

## 4️⃣ Device Loss Handling

### Lost WebAuthn device

```js
// 1. Reconstruct K_user via OAuth + A2F
// 2. Generate new S2_new share
// 3. Encrypt S2_new locally, wrap with new WebAuthn credential
// 4. Update ledger metadata (version increment, revoke old S2)
```

### Lost A2F device

```js
// 1. Reconstruct K_user via OAuth + WebAuthn
// 2. Generate new S3_new share
// 3. Encrypt S3_new with new A2F device/seed
// 4. Update ledger metadata (version increment, revoke old S3)
```

### Lost OAuth account

```js
// 1. Reconstruct K_user via WebAuthn + A2F
// 2. Generate new S1_new share
// 3. Encrypt S1_new with cached local key (K_A)
// 4. Update ledger metadata (version increment, revoke old S1)
// 5. Re-link new OAuth account to ledger
```

---

### ✅ Key Points

1. **K_user always reconstructable only with ≥2 factors**
2. **Server never sees K_user or raw shares**
3. **Ledger tracks versions & revoked flags** for rotation
4. **Device-bound factors** (WebAuthn) protect local shares
5. **Rotation / recovery always starts from 2 valid factors**
6. **Single-factor compromise ≠ account compromise**

---

This pseudo-code is **directly implementable** in any web/mobile client architecture.

If you want, I can produce a **diagram overlay showing rotation / revocation on the 2-of-3 flow**, visually indicating old vs new shares, which makes this easier to explain to engineers.

# 5) Adapter Specification Based on Existing Patterns

**We’ll use the Passport.js strategy-inspired pattern** for familiarity: one adapter per auth mechanism.
It allows **plug-and-play integration** while exposing a unified interface.

---

## 5.1 Adapter Pattern for Enterprise Authorization

* Adapter implements `AuthAdapter`
* Supports: LDAP, SAML, OAuth2
* Handles enterprise credentials, group lookup, role mapping
* Example:

```ts
class LDAPAdapter implements AuthAdapter {
    constructor(public config: LDAPConfig) {}
    async authenticate({ credentials }: AuthInput) {
        return ldapBind(credentials.username, credentials.password);
    }
}
```

---

## 5.2 Single Flow Support (Plug-and-Play)

* Out-of-box support for:

  * LDAP username/password
  * SAML SSO
  * OAuth2
  * Email + password
* Utilities handle boilerplate:

  * Connect to server
  * Hash / verify passwords or tokens
  * Map roles/groups to internal permissions

**Usage Example:**

```ts
const authFramework = new AuthFramework();
authFramework.registerAdapter(new LDAPAdapter({ url: "ldap://corp" }));
authFramework.registerAdapter(new OAuth2Adapter({ clientId, clientSecret }));
authFramework.registerAdapter(new EmailPasswordAdapter({ hashAlgo: 'argon2id' }));

// Developer selects which adapters to enable per API endpoint
api.use(authFramework.middleware(['LDAP', 'OAuth2']));
```

---

## 5.3 Integrating 2-of-3 Flow via Adapter

* Adapter exposes `decryptClientKey()`
* Integrates client-provided factor inputs:

  * WebAuthn assertion
  * A2F code
  * OAuth identity (locator)

```ts
class TwoOfThreeAdapter implements AuthAdapter {
    constructor(public config: AdapterConfig) {}
    async decryptClientKey(clientFactors: FactorInput[]) {
        // validate ≥ requiredFactors
        // fetch shares from ledger / local storage
        // decrypt per factor
        // combine shares via SSS.combine()
        return K_user;
    }
}
```

**Plug-and-play pattern:**

```ts
authFramework.registerAdapter(new TwoOfThreeAdapter({
    requiredFactors: 2,
    allowedFlows: ['WebAuthn+A2F', 'OAuth2+A2F', 'OAuth2+WebAuthn'],
    auditEnabled: true
}));
```

---

## 5.4 Configuration Options for Engineers

Engineers can configure:

| Option                | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `requiredFactors`     | Threshold for 2-of-3 flow (default 2)                  |
| `allowedFlows`        | Which factor combinations are permitted                |
| `maxRetry`            | Number of failed attempts before lockout               |
| `auditEnabled`        | Enable logging of recovery / rotation events           |
| `factorOrder`         | Optional preference for which factor to validate first |
| `rotationWindow`      | Schedule automated rotation / expiration               |
| `ledgerEndpoint`      | URL or storage backend for encrypted shares            |
| `localStorageOptions` | Platform-specific options for WebAuthn/A2F secrets     |

---

## 5.5 Adapter Integration Requirements

1. **Implementation of AuthAdapter interface**

   * Must implement `authenticate()` for enterprise adapters
   * Must implement `decryptClientKey()` for 2-of-3 flows

2. **Pluggable configuration**

   * Can register multiple adapters for different endpoints / user types

3. **Factor input validation**

   * Client must supply correct factor data structure
   * Adapter validates factor authenticity (WebAuthn signature, TOTP code, etc.)

4. **Ledger / local storage access**

   * 2-of-3 adapter must be able to fetch encrypted shares from server or client local storage

5. **Audit hooks**

   * Rotation and revocation events must trigger hooks or logs

6. **Error handling**

   * Adapter should clearly return `AuthError` with factor info if decryption fails
   * Must not leak sensitive info (like partial shares)

---

### ✅ Summary

* **Pattern:** Passport.js-style strategy adapter
* **Enterprise adapters:** LDAP / SAML / OAuth2
* **Single flow:** plug-and-play, pre-wired utilities
* **2-of-3 flow:** pluggable adapter for client-factor based key reconstruction
* **Configuration:** engineers can select threshold, allowed flows, audit, retry limits
* **Integration:** adapter must implement interface, fetch shares, validate factors, combine shares

---

Here’s an **ASCII diagram** showing the adapter layer including **enterprise adapters** (LDAP, SAML, OAuth2) and the **2-of-3 flow adapter**, with clear flow of requests, factor validation, and key reconstruction.

---

## Node.js API Framework with Adapter Layer — ASCII Diagram

```
                           ┌───────────────────────────┐
                           │   Client Application      │
                           │ (Browser / Mobile / CLI) │
                           └─────────────┬─────────────┘
                                         │
              ---------------------------│---------------------------
              │                           │                         │
      Enterprise Auth Flow           2-of-3 Flow                Multi-Factor
      (LDAP / SAML / OAuth2)       (WebAuthn + A2F + OAuth)   / Custom Flows
              │                           │                         │
              ▼                           ▼                         ▼
      ┌─────────────────────────────┐    ┌─────────────────────┐
      │ Enterprise Adapter Layer    │    │  TwoOfThreeAdapter  │
      │ (implements AuthAdapter)    │    │  (implements AuthAdapter) 
      │ --------------------------- │    │ ------------------- │
      │ LDAPAdapter                 │    │ decryptClientKey()  │
      │ SAMLAdapter                 │    │ validate ≥2 factors │
      │ OAuth2Adapter               │    │ fetch shares from   │
      │ EmailPasswordAdapter        │    │ ledger / local      │
      │ authenticate(credentials)   │    │ combine via SSS     │
      └─────────────┬───────────────┘    └──────────┬──────────┘
                    │                               │
                    │                               │
        ┌───────────▼───────────┐         ┌─────────▼────────────┐
        │ Framework Core / API  │         │ Ledger / Storage     │
        │ Middleware / Routing  │         │ Enc_S1 / Enc_S2 / S3 │
        │ Request Validation    │         │ Metadata / Versioning│
        │ Role / Permission     │         │ Audit Logs           │
        └───────────┬───────────┘         └─────────┬────────────┘
                    │                               │
      ---------------------------                 ------
      |                         |                   |
      ▼                         ▼                   ▼
   Response                  Error / Retry      Rotation / Revocation
   Data / Tokens             Failed Auth          Update Ledger
```

---

### Flow Descriptions

**1. Enterprise Flow (LDAP/SAML/OAuth2)**

1. Client submits credentials (username/password, SAML assertion, OAuth token)
2. Framework routes request to the registered adapter (e.g., LDAPAdapter)
3. Adapter authenticates against enterprise service
4. Returns `AuthResult` to framework
5. Framework handles session, role mapping, logging

---

**2. 2-of-3 Flow (WebAuthn + A2F + OAuth)**

1. Client submits ≥2 factor inputs:

   * WebAuthn assertion (resident credential)
   * A2F code (TOTP / hardware key)
   * OAuth identity (locator)
2. Framework routes request to `TwoOfThreeAdapter`
3. Adapter:

   * Validates factor inputs
   * Fetches encrypted shares from ledger / local storage
   * Decrypts each share per factor
   * Combines shares via Shamir Secret Sharing to reconstruct `K_user`
4. Returns `K_user` or derived session token to framework
5. Framework allows access to API resources, handles audit logs

---

**3. Rotation / Revocation**

* Triggered manually or automatically (e.g., lost device)
* Framework instructs adapter to:

  * Reconstruct `K_user` from remaining valid factors
  * Generate new shares
  * Encrypt shares per factor
  * Update ledger with new version
  * Mark old shares as revoked
* Framework logs rotation event, optionally notifies user

---

**4. Configuration Layer**

Each adapter supports configuration parameters exposed in the framework:

| Config Option         | Purpose                                     |
| --------------------- | ------------------------------------------- |
| `requiredFactors`     | Number of factors needed for 2-of-3 flow    |
| `allowedFlows`        | Factor combinations allowed                 |
| `maxRetry`            | Limit authentication attempts               |
| `auditEnabled`        | Enable logging for recovery / rotation      |
| `ledgerEndpoint`      | Backend for encrypted shares                |
| `localStorageOptions` | WebAuthn / platform-specific secure storage |
| `factorOrder`         | Preferred order for validating factors      |
| `rotationWindow`      | Optional auto-rotation schedule             |

---

### Key Points Illustrated

* **Adapter Layer abstracts all auth mechanisms**
* **TwoOfThreeAdapter supports complex multi-factor recovery**
* **Enterprise adapters remain plug-and-play**
* **Framework core handles routing, logging, and token/session issuance**
* **Rotation and revocation flow through adapters but ledger enforces versioning**

---


## Multi-Device 2-of-3 Flow — ASCII Diagram

```
                             ┌─────────────────────────────┐
                             │        Client Device 1      │
                             │  (WebAuthn / A2F / OAuth)   │
                             └─────────────┬───────────────┘
                                           │
                                           │ enroll WebAuthn1 + A2F1
                                           ▼
                        ┌─────────────────────────────┐
                        │ TwoOfThreeAdapter (API FW)  │
                        │                             │
                        │ - Store Enc_S2_1 (WebAuthn1)│
                        │ - Store Enc_S3_1 (A2F1)     │
                        │ - Ledger version 1          │
                        └─────────────┬───────────────┘
                                      │
──────────────────────────────────────────────────────────────────────────────
                             Additional Devices Enrollment
──────────────────────────────────────────────────────────────────────────────
                             ┌─────────────────────────────┐
                             │        Client Device 2      │
                             │  (WebAuthn2 / A2F2)         │
                             └─────────────┬───────────────┘
                                           │ enroll WebAuthn2 + A2F2
                                           ▼
                        ┌─────────────────────────────┐
                        │ TwoOfThreeAdapter           │
                        │                             │
                        │ - Store Enc_S2_2 (WebAuthn2)│
                        │ - Store Enc_S3_2 (A2F2)     │
                        │ - Ledger version 2          │
                        └─────────────┬───────────────┘
                                      │
──────────────────────────────────────────────────────────────────────────────
                              Account Recovery / Login
──────────────────────────────────────────────────────────────────────────────
[Client Device X] submits ≥2 factors:
  Options:
    1. WebAuthn1 + A2F2
    2. WebAuthn2 + A2F1
    3. WebAuthn1 + OAuth identity
    4. WebAuthn2 + OAuth identity
                                           │
                                           ▼
                        ┌─────────────────────────────┐
                        │ TwoOfThreeAdapter           │
                        │                             │
                        │ - Validate WebAuthn assertion│
                        │ - Validate A2F code         │
                        │ - Fetch corresponding shares│
                        │ - Combine ≥2 shares via SSS │
                        │ - Reconstruct K_user        │
                        └─────────────┬───────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────────┐
                        │ Framework Core / API        │
                        │                             │
                        │ - Issue session / token     │
                        │ - Log audit event           │
                        │ - Allow access to resources │
                        └─────────────┬───────────────┘
                                      │
──────────────────────────────────────────────────────────────────────────────
                             Rotation / Revocation
──────────────────────────────────────────────────────────────────────────────
- Lost device (WebAuthn1 or A2F1)
    - Reconstruct K_user using remaining ≥2 factors
    - Generate new shares for lost factor (S2_new / S3_new)
    - Update ledger version, mark old shares revoked
    - Enroll new WebAuthn or A2F device
- Rotation:
    - Reconstruct K_user using any ≥2 valid factors
    - Re-share all factors with new encryption keys
    - Update ledger version
```

---

### Key Points Illustrated

1. **Multi-device support**

   * Multiple WebAuthn devices (WebAuthn1, WebAuthn2)
   * Multiple A2F devices (A2F1, A2F2)

2. **≥2 factor enforcement**

   * Any two valid factors from any combination of devices reconstruct `K_user`

3. **Ledger versioning**

   * Each new enrollment or rotation increments the ledger version
   * Old shares marked revoked

4. **Device loss handling**

   * Lost WebAuthn / A2F device → generate new share, revoke old share
   * Remaining devices + OAuth allow recovery

5. **Rotation / Audit**

   * Can rotate all shares proactively
   * Framework logs events for auditing

---

This visual makes it clear how **multi-device enrollment, recovery, rotation, and revocation** fit seamlessly into the 2-of-3 framework.
