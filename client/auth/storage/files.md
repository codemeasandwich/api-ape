# Client Auth Storage Module

IndexedDB storage for encrypted shares and keys.

## Directory Structure

```
storage/
├── constants.js - Storage constants (DB name, store names)
├── db.js        - IndexedDB connection management
├── keys.js      - Wrapped key storage operations
└── shares.js    - Encrypted share storage operations
```

## Files

### `constants.js`
Defines StorageError codes, database name, and object store names.

### `db.js`
Manages IndexedDB connection lifecycle with version upgrades and cleanup.

### `shares.js`
CRUD operations for encrypted shares in IndexedDB with versioning.

### `keys.js`
Storage for WebAuthn-wrapped keys to decrypt S2 share.
