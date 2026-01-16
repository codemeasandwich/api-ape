# Two-of-Three Module

2-of-3 key recovery adapter components.

## Directory Structure

```
two-of-three/
├── constants.js - Message types, error codes, default config
├── handlers.js  - Enrollment and recovery handler factories
└── helpers.js   - Cleanup and utility functions
```

## Files

### `constants.js`
Defines TwoOfThreeMessageType, TwoOfThreeError, and DEFAULT_CONFIG.

### `handlers.js`
Factory functions for enrollment start/finish, recovery start/complete, and rotation handlers.

### `helpers.js`
Pending state cleanup and expiry management utilities.
