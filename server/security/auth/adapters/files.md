# Authentication Adapters Files

This directory contains protocol-specific authentication adapters. Each adapter implements a specific authentication protocol and is registered with the auth framework.

## Guidelines

- **Session isolation** — Pending sessions are keyed by `clientId:username` for concurrent auth support
- **Nonce binding** — Server nonces bind auth transcript to specific connection parameters
- **Cleanup on disconnect** — Call `cleanupClient()` when socket disconnects

## Directory Structure

```
adapters/
├── opaque.js          # OPAQUE adapter factory and enums
├── opaque-handlers.js # OPAQUE message handlers
├── ldap.js            # LDAP/AD adapter (Passport.js compatible)
├── saml.js            # SAML 2.0 SSO adapter (Passport.js compatible)
├── oauth2.js          # OAuth2 adapter (Passport.js compatible)
├── webauthn.js        # WebAuthn/FIDO2 adapter (Passport.js compatible)
└── totp.js            # TOTP RFC 6238 adapter (Passport.js compatible)
```

## Files

### `opaque.js`

OPAQUE protocol adapter for zero-knowledge password authentication:

- Server never learns the user's raw password
- `createOpaqueAdapter(config)` — Creates adapter with user storage functions
- Exports `OpaqueMessageType` and `OpaqueError` enums
- Supports optional `@cloudflare/opaque` library for cryptographic operations

### `opaque-handlers.js`

OPAQUE message handler implementations:

- Registration flow: `handleRegStart`, `handleRegFinish`
- Auth flow: `handleAuthStart`, `handleAuthFinish`
- Manages pending sessions with automatic expiry cleanup
- Creates user principal on successful authentication

### `webauthn.js`

WebAuthn/FIDO2 adapter for hardware security key MFA (Tier 2):

- `createWebAuthnStrategy(config, verify)` — Passport.js-compatible factory
- Registration flow: `handleRegStart`, `handleRegFinish`
- Auth flow: `handleAuthStart`, `handleAuthFinish`
- Exports `WebAuthnMessageType` and `WebAuthnError` enums
- Counter validation prevents authenticator cloning
- Mock mode for testing (real verification requires `@simplewebauthn/server`)

### `ldap.js`

LDAP/Active Directory adapter for enterprise authentication (Tier 1):

- `createLDAPStrategy(config, verify)` — Passport.js-compatible factory
- Simple bind and search-then-bind modes
- Group membership extraction for role mapping
- Exports `LDAPMessageType` and `LDAPError` enums
- Mock mode for testing (real bind requires `ldapjs`)

### `saml.js`

SAML 2.0 SSO adapter for enterprise identity providers (Tier 1):

- `createSAMLStrategy(config, verify)` — Passport.js-compatible factory
- SP-initiated and IdP-initiated SSO support
- Handles `handleAuthStart`, `handleAuthCallback`, `handleLogoutStart`
- Exports `SAMLMessageType` and `SAMLError` enums
- Mock mode for testing (real validation requires `passport-saml`)

### `oauth2.js`

OAuth2 Authorization Code adapter for identity providers (Tier 1):

- `createOAuth2Strategy(config, verify)` — Passport.js-compatible factory
- PKCE support for enhanced security
- Handles `handleAuthStart`, `handleAuthCallback`, `handleTokenRefresh`
- Exports `OAuth2MessageType` and `OAuth2Error` enums
- State parameter for CSRF protection
- Mock mode for testing (real token exchange requires HTTP client)

### `totp.js`

TOTP RFC 6238 adapter for authenticator app MFA (Tier 2):

- `createTOTPStrategy(config, verify)` — Passport.js-compatible factory
- Setup flow: `handleSetupStart`, `handleSetupVerify`
- Verify flow: `handleVerify`, `handleDisable`
- Exports `TOTPMessageType` and `TOTPError` enums
- Built-in base32 encoding, HMAC-SHA1 code generation
- Counter tracking prevents code replay within window
