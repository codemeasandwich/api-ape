# Error Handling Test Scenario Files

Tests error propagation and graceful error handling.

## Directory Structure

```
developer-error-handling/
├── user-sees-controller-thrown-errors.js
└── user-sees-friendly-error-when-calling-bad-endpoint.js
```

## Files

### user-sees-controller-thrown-errors.js

Tests that errors thrown by controllers are received by the client with the correct message.

### user-sees-friendly-error-when-calling-bad-endpoint.js

Tests that calling a non-existent endpoint throws an error but keeps the connection alive.
