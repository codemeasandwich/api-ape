# MFA Ledger Module

Share versioning and revocation ledger.

## Directory Structure

```
ledger/
├── constants.js    - Enums (ShareId, FactorType, message types)
├── errors.js       - Error factory functions
└── share-record.js - Share record factory
```

## Files

### `constants.js`
Defines ShareId (S1, S2, S3), FactorType (OAUTH, WEBAUTHN, TOTP), LedgerMessageType, and LedgerError.

### `errors.js`
Factory functions: userNotFound(), shareNotFound(), shareRevoked(), alreadyEnrolled(), invalidShareId().

### `share-record.js`
Creates share records with version tracking and metadata.
