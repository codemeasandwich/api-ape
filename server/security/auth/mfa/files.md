# MFA / Key Recovery Files

This directory contains the server-side implementation for MFA and 2-of-3 key recovery (Tier 3).

## Guidelines

- **GF(256) arithmetic** - Pure JavaScript Shamir Secret Sharing
- **Node.js crypto** - Uses built-in crypto module for all operations
- **Ledger versioning** - Track share versions for rotation and audit
- **Passport.js compatible** - Two-of-three adapter implements Strategy interface

## Directory Structure

```
mfa/
├── crypto-utils.js       # Server crypto utilities (Node.js crypto)
├── crypto-utils.test.js  # Crypto tests
├── ledger.js             # Share versioning ledger
├── ledger.test.js        # Ledger tests
├── recovery.js           # Key recovery handler
├── recovery.test.js      # Recovery tests
├── sss.js                # Shamir Secret Sharing (GF(256))
├── sss.test.js           # SSS tests
├── two-of-three.js       # 2-of-3 recovery adapter
└── two-of-three.test.js  # 2-of-3 tests
```

## Files

### `crypto-utils.js`

Server-side cryptographic utilities:

- `aeadEncrypt/aeadDecrypt` - AES-256-GCM encryption with AEAD
- `hkdf` - RFC 5869 key derivation (Node.js 15+ or manual)
- `argon2id` - Memory-hard KDF with PBKDF2 fallback
- `packEncrypted/unpackEncrypted` - Pack/unpack for storage
- `deriveKeyForPurpose` - Purpose-specific key derivation

### `sss.js`

Shamir Secret Sharing implementation (GF(256)):

- `split(secret, threshold, total)` - Split secret into n shares
- `combine(shares)` - Lagrange interpolation to reconstruct
- `serializeShare/deserializeShare` - Base64url serialization
- `verifyShareFormat` - Validate share format
- Pre-computed GF(256) log/exp tables for fast arithmetic

### `ledger.js`

Share versioning and audit ledger:

- `storeShares` - Store encrypted shares with metadata
- `fetchShares` - Retrieve shares for recovery
- `rotateShare` - Version-controlled share rotation
- `revokeShare` - Mark share as compromised
- `getAuditLog` - Retrieve audit events

### `recovery.js`

Key recovery handler for message routing:

- `handleRecoveryStart` - Start recovery flow
- `handleRecoveryComplete` - Verify reconstruction proof
- `handleRotationStart` - Handle share rotation
- Integration with state machine for tier elevation

### `two-of-three.js`

2-of-3 recovery adapter (Passport.js compatible):

- `createTwoOfThreeStrategy(config, verify)` - Factory function
- `handleEnrollmentStart/Finish` - Enrollment flow
- `handleRecoveryStart/Complete` - Recovery flow
- `handleRotation` - Share rotation
- Exports `TwoOfThreeMessageType` and `TwoOfThreeError` enums
