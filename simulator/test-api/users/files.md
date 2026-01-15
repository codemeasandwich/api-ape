# Users Controllers Module Files

This module provides test controllers for user-related endpoints. These controllers demonstrate nested routing and controller context usage.

## Guidelines

- **Context usage** — Use `this.clientId` and embedded values for testing
- **Minimal logic** — Keep implementations simple; focus on testing routing

## Directory Structure

```
users/
├── index.js    # User list endpoint (maps to 'users')
└── profile.js  # User profile endpoint (maps to 'users/profile')
```

## Files

### `index.js`

Returns a list of users. Supports optional role filtering via input data. Maps to the `users` endpoint.

### `profile.js`

Returns user profile data including the client ID from context. Used to test that embedded values are accessible via `this.*`. Maps to the `users/profile` endpoint.
