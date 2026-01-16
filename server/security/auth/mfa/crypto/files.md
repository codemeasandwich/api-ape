# MFA Crypto Module

Server-side cryptographic utilities for key recovery.

## Directory Structure

```
crypto/
├── aead.js      - AES-256-GCM encryption/decryption
├── constants.js - Crypto constants and error codes
├── kdf.js       - Key derivation (HKDF, Argon2id, PBKDF2)
└── utils.js     - Salt/key generation, timing-safe compare
```

## Files

### `constants.js`
Defines key lengths, nonce sizes, and CryptoError codes.

### `aead.js`
AES-256-GCM authenticated encryption with pack/unpack utilities.

### `kdf.js`
HKDF, Argon2id (with PBKDF2 fallback), and deriveKeyForPurpose().

### `utils.js`
Random salt/key generation, timing-safe comparison, SHA-256, HMAC-SHA256.
