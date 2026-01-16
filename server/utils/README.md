# Server Utils Module

## Overview

Server-side utility functions used throughout the api-ape server implementation. These utilities provide essential functionality for controller loading, unique ID generation, and client identification via User-Agent parsing.

**Key capabilities:**

- **Controller loading** — Recursively load JavaScript modules and map file paths to API endpoints
- **ID generation** — Generate unique, URL-safe identifiers using Crockford Base32 encoding
- **User-Agent parsing** — Zero-dependency parsing for browser, OS, device, and bot detection

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## See Also

- [`userAgent/README.md`](./userAgent/README.md) — User-agent detection patterns
- [`../lib/loader.js`](../lib/loader.js) — Controller loader using deepRequire
- [`../lib/wiring.js`](../lib/wiring.js) — Uses parseUserAgent for client info