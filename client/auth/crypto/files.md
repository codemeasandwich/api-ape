# Client Auth Crypto Module

Browser-side cryptographic utilities using Web Crypto API.

## Directory Structure

```
crypto/
├── aead.js       - AES-GCM encryption/decryption
├── constants.js  - Crypto constants and error codes
├── encoding.js   - Base64/hex encoding utilities
└── kdf.js        - Key derivation functions (PBKDF2)
```

## Files

### `constants.js`
Defines AES key lengths, nonce lengths, and error codes for crypto operations.

### `encoding.js`
Provides base64url and hex encoding/decoding utilities for browser environments.

### `aead.js`
AES-256-GCM authenticated encryption using Web Crypto API.

### `kdf.js`
PBKDF2 key derivation for encrypting shares client-side.
