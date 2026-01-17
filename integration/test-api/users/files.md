# Integration Test API - Users Controllers

User-related controllers for integration testing.

## Directory Structure

```
users/
└── create.js
```

## Files

### `create.js`

Creates a user and sends a notification to all connected clients. Used for testing send-to-all functionality via `this.clients.forEach()`.
