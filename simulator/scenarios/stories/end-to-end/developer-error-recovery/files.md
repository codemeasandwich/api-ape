# Error Recovery Test Scenario Files

Tests client recovery after encountering errors.

## Directory Structure

```
developer-error-recovery/
├── user-continues-after-api-error.js
└── user-handles-async-controller-error.js
```

## Files

### user-continues-after-api-error.js

Tests that a user can make successful calls, hit an error, and continue with more successful calls.

### user-handles-async-controller-error.js

Tests that async errors from controllers propagate correctly and the connection remains usable.
