# WebSocket Polyfill Module

## Overview

The ws module provides a zero-dependency, RFC 6455 compliant WebSocket implementation for api-ape. It serves as a fallback when native WebSocket support is unavailable, ensuring api-ape works across all Node.js versions without requiring external packages.

**Key capabilities:**

- **RFC 6455 compliant** — Full implementation of the WebSocket protocol specification
- **Zero dependencies** — Pure JavaScript implementation with no external packages
- **ws library compatible** — Drop-in replacement matching the popular `ws` package API
- **Frame protocol** — Complete frame encoding, decoding, masking, and fragmentation support
- **Control frames** — Proper handling of ping, pong, and close frames
- **Runtime adapters** — Adapters for Bun and Deno native WebSocket implementations

The polyfill is automatically selected by `wsProvider.js` when running on Node.js versions prior to 24 (which introduced native WebSocket support) and when native runtime adapters are unavailable.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## When Is This Used?

The polyfill is automatically selected by `wsProvider.js` when:

| Condition | WebSocket Provider Used |
|-----------|------------------------|
| Deno runtime | Native `Deno.upgradeWebSocket()` |
| Bun runtime | Native Bun WebSocket |
| Node.js 24+ | Native `node:ws` module |
| Node.js < 24 | **This polyfill** |

## See Also

- [`adapters/README.md`](./adapters/README.md) — Runtime-specific WebSocket adapters
- [`../wsProvider.js`](../wsProvider.js) — Runtime detection and provider selection
- [RFC 6455](https://tools.ietf.org/html/rfc6455) — WebSocket Protocol specification