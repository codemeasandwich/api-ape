# Server Utils Module Files

This module provides server-side utility functions used throughout the api-ape server implementation, including controller loading, unique ID generation, and client identification via User-Agent parsing.

## Guidelines

- **Zero dependencies** — All utilities must work without external packages
- **Controller mapping convention** — File paths map to endpoints: `api/users.js` → `users`, `api/users/profile.js` → `users/profile`
- **Duplicate detection** — `deepRequire.js` must detect and error on duplicate endpoint mappings
- **URL-safe IDs** — Generated IDs use Crockford Base32 (excludes I, L, O, U to avoid ambiguity)
- **User-Agent patterns** — Add new browser/bot patterns to `userAgent/patterns.js`, ordered from most specific to least specific
- **Bot detection accuracy** — Test new bot patterns against real User-Agent strings before adding

## Directory Structure

```
utils/
├── deepRequire.js    # Recursive module loader for controllers
├── genId.js          # Unique ID generator (Crockford Base32)
├── parseUserAgent.js # User-agent string parser
└── userAgent/        # User-agent detection patterns
```

## Files

### `deepRequire.js`

Recursively loads all JavaScript modules from a directory tree and maps file paths to endpoint names:

- `api/users.js` → `controllers['users']`
- `api/users/profile.js` → `controllers['users/profile']`
- `api/users/index.js` → `controllers['users']`

Detects duplicate endpoint mappings and throws helpful errors.

### `genId.js`

Generates unique identifiers using Crockford Base32 encoding:

- Configurable length (default: 20 characters)
- URL-safe characters (excludes I, L, O, U)
- Used for `clientId` and other internal identifiers

### `parseUserAgent.js`

Zero-dependency User-Agent string parser that extracts:

- **Browser** — Chrome, Firefox, Safari, Edge, and 40+ others
- **Engine** — Blink, Gecko, WebKit, Trident
- **OS** — Windows, macOS, iOS, Android, Linux
- **Device** — mobile, tablet, console, smarttv, wearable
- **CPU** — arm64, arm, amd64, ia32
- **Bot detection** — AI bots, crawlers, headless browsers

### `userAgent/`

User-Agent detection patterns and lookup tables. See [`userAgent/files.md`](./userAgent/files.md).