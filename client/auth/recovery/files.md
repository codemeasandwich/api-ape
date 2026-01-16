# Client Auth Recovery Module

Browser-side key recovery using Shamir Secret Sharing.

## Directory Structure

```
recovery/
├── constants.js      - Recovery error codes and factor types
├── key-derivation.js - Per-factor key derivation (S1, S2, S3)
└── sss-browser.js    - Shamir Secret Sharing for browser (GF256)
```

## Files

### `constants.js`
Defines KeyRecoveryError codes and FactorType enum (OAUTH, WEBAUTHN, TOTP).

### `key-derivation.js`
Derives encryption keys for each share: deriveS1Key (OAuth), deriveS2Key (WebAuthn), deriveS3Key (TOTP).

### `sss-browser.js`
Implements Shamir Secret Sharing over GF(256) for browsers. Includes Lagrange interpolation, share serialization, and Galois field arithmetic.
