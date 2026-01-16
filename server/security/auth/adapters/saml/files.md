# SAML Adapter Module

SAML 2.0 SSO authentication helpers.

## Directory Structure

```
saml/
├── constants.js - SAML message types and error codes
└── helpers.js   - Request storage and ID generation
```

## Files

### `constants.js`
Defines SAMLMessageType (AUTH_REDIRECT, AUTH_OK, AUTH_FAIL, LOGOUT_*) and SAMLError codes.

### `helpers.js`
Pending request storage and request ID generation for SAML flows.
