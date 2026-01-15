# LDAP Adapter Module

LDAP/Active Directory authentication helpers.

## Directory Structure

```
ldap/
├── constants.js - LDAP message types and error codes
└── helpers.js   - Storage and mock LDAP client
```

## Files

### `constants.js`
Defines LDAPMessageType (AUTH, AUTH_OK, AUTH_FAIL) and LDAPError codes.

### `helpers.js`
Creates mock LDAP client for testing with bind, search, and unbind operations.
