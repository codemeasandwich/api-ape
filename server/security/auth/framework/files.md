# Auth Framework Module

Socket authentication coordination and message routing.

## Directory Structure

```
framework/
├── constants.js   - Auth message prefixes and routing
├── handlers.js    - Protocol-specific handler factories
└── socket-auth.js - Per-socket auth state manager
```

## Files

### `constants.js`
AUTH_MESSAGE_PREFIXES for routing and isAuthMessage() helper.

### `handlers.js`
Factory functions for OPAQUE, LDAP, MFA, WebAuthn, TOTP, and Key Recovery handlers.

### `socket-auth.js`
Creates per-socket auth managers with handleMessage(), getState(), getTier(), and authorize().
