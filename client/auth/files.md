# Client Authentication SDK Files

This directory contains the client-side SDK for key recovery and authentication.

## Guidelines

- **Browser-compatible** - Uses Web Crypto API and IndexedDB
- **Secure storage** - S2 share encrypted with WebAuthn-derived key
- **API compatible** - Crypto utilities match server-side interface

## Directory Structure

```
auth/
├── crypto-utils.js       # Browser crypto utilities (Web Crypto API)
├── key-recovery.js       # Key recovery client SDK
├── key-recovery.test.js  # Client SDK tests
├── share-storage.js      # IndexedDB share storage
└── share-storage.test.js # Storage tests
```

## Files

### `crypto-utils.js`

Browser-compatible cryptographic utilities:

- `aeadEncrypt/aeadDecrypt` - AES-256-GCM encryption with AEAD
- `hkdf` - RFC 5869 key derivation using Web Crypto API
- `argon2id` - Password-based KDF with PBKDF2 fallback
- `packEncrypted/unpackEncrypted` - Pack/unpack for storage
- API compatible with `server/security/auth/mfa/crypto-utils.js`

### `key-recovery.js`

Client SDK for 2-of-3 key recovery (Tier 3):

- `KeyRecoveryClient` - Main client class
- `enroll()` - Generate K_user, split shares, encrypt, store S2 locally
- `recover()` - Fetch encrypted shares, decrypt, combine to reconstruct
- `rotateShare()` - Handle share rotation after device loss
- GF(256) Shamir Secret Sharing implementation for browser

### `share-storage.js`

IndexedDB storage for S2 share (WebAuthn-gated):

- `saveShare/getShare` - Store/retrieve encrypted shares
- `saveWrappedKey/getWrappedKey` - Store/retrieve wrapped L_keys
- `saveMetadata/getMetadata` - Store enrollment metadata
- `createUserStorage()` - Convenience factory with bound userId
- Database schema: shares, keys, metadata stores
