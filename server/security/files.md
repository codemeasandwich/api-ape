# Security Module Files

This module provides security features to protect api-ape connections from common web vulnerabilities, including CSRF protection and duplicate request detection. Origin validation is enabled by default.

## Guidelines

- **Origin validation is critical** — Changes to `origin.js` affect all connection security; test thoroughly
- **Domain matching** — Use `extractRootDomain.js` for domain comparisons; don't implement custom logic
- **Subdomain support** — Origin checks must work with subdomains (e.g., `app.example.com` vs `example.com`)
- **No configuration required** — Security features should work out-of-the-box with sensible defaults
- **Fail secure** — When in doubt, reject the connection; false positives are better than security holes
- **Localhost exceptions** — Development on localhost should work without origin issues

## Directory Structure

```
security/
├── extractRootDomain.js   # Domain extraction for origin validation
├── origin.js              # Origin verification (CSRF protection)
└── reply.js               # Duplicate request protection
```

## Files

### `origin.js`

Origin validation to prevent Cross-Site Request Forgery (CSRF) attacks:

- Validates the `Origin` header against the `Host` header
- Ensures WebSocket connections only come from the same origin
- Automatically rejects cross-origin requests
- Works with both Express.js and raw Node.js servers
- Returns `true` if valid, `false` to reject connection

### `extractRootDomain.js`

Extracts the root domain from a hostname for flexible origin matching:

- Handles subdomains (e.g., `app.example.com` → `example.com`)
- Handles IP addresses and localhost
- Handles ports in host strings (strips them for comparison)
- Used by `origin.js` for domain comparison

### `reply.js`

Duplicate request protection to prevent replay attacks:

- Tracks recently processed `queryId` values
- Rejects duplicate requests within a configurable time window
- Prevents attackers from replaying captured WebSocket messages
- Automatically cleans up expired entries