# MFA Recovery Module

Device loss recovery handler components.

## Directory Structure

```
recovery/
├── constants.js - Recovery message types and error codes
└── handlers.js  - Recovery handler factory functions
```

## Files

### `constants.js`
Defines RecoveryMessageType, RecoveryError, and RECOVERY_REQUIREMENTS mapping.

### `handlers.js`
Factory functions for lost device start, verify factor, and regenerate share handlers.
