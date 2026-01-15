# OAuth2 Adapter Module

OAuth2 Authorization Code flow helpers.

## Directory Structure

```
oauth2/
├── constants.js - OAuth2 message types and error codes
└── helpers.js   - State management and PKCE utilities
```

## Files

### `constants.js`
Defines OAuth2MessageType (AUTH_START, AUTH_REDIRECT, AUTH_CALLBACK, etc.) and OAuth2Error codes.

### `helpers.js`
State storage, PKCE code verifier/challenge generation, and mock token management.
