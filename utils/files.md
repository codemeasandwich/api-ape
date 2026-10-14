# Utils Module Files

This module provides shared serialization and hashing utilities used by both client and server components of api-ape. These utilities enable the framework's ability to transparently handle complex JavaScript types over WebSocket connections.

## Guidelines

- **Isomorphic code** — All utilities must work identically in browser and Node.js/Bun/Deno environments
- **No Node.js APIs** — Avoid `fs`, `path`, `Buffer` and other Node-specific APIs; use browser-compatible alternatives
- **JSS consistency** — Changes to encoding must be mirrored in decoding; tags must match exactly
- **Hash stability** — The `messageHash` algorithm must remain deterministic; changing it breaks request/response correlation
- **Circular reference support** — JSS must handle circular references via path pointers (`<!P>` tag)
- **Test coverage** — All utilities have corresponding `.test.js` files; update tests when modifying behavior

## Directory Structure

```
utils/
├── apeLogger.js             # Centralized configurable framework logging (see configureApeLogging)
├── jss.js                   # JSS main entry point (encode/decode/stringify/parse)
├── jss.d.ts                 # Types for `api-ape/jss`
├── jss.test.js              # JSS test suite
├── messageHash.js           # Jenkins hash with Crockford Base32 encoding
├── messageHash.d.ts         # Types for `api-ape/messageHash`
├── wireError.js             # How a failed call travels: Error via JSS + code/data
├── messageHash.test.js      # Message hash test suite
├── parseUserAgent.test.js   # User-Agent parser test suite
└── jss/                     # JSS encoder/decoder implementations
```

## Files

### `apeLogger.js`

Internal logging facade for api-ape on both browser and Node. Exports `configureApeLogging()`, `resetApeLoggingForTesting()`, and `apeLog` (log/warn/error/info/debug) so callers can silence or reroute diagnostics without patching `console`.

### `wireError.js`

How a failed call travels from a controller to its caller. `errorFrame(thrown, type, queryId)` (server) builds the reply `{ err: <Error via JSS>, errCode?, errData?, type, queryId }`: name and message are kept, the stack is replaced by `"Name: message"` so no server paths leak, and unserialisable `data` is dropped rather than losing the reply. `attachErrorDetails(err, frame)` (browser and Node clients) puts `code` / `data` back on the Error. `toWireError` normalises strings and Error-shaped objects.

### `jss.d.ts`

Types for the `api-ape/jss` entry point (`stringify`, `parse`, `encode`, `decode`).

### `messageHash.d.ts`

Types for the `api-ape/messageHash` entry point: `messageHash(message): string`, the `queryId` of a call.

### `jss.js`

Main entry point for JSON Super Set serialization. Re-exports `encode`, `decode`, `stringify`, and `parse` from the `jss/` subdirectory. This is a drop-in replacement for `JSON.stringify` and `JSON.parse` that handles extended types.

**Supported Types:**

| Type | Tag | Encoded As |
|------|-----|------------|
| Date | `<!D>` | Unix timestamp (milliseconds) |
| RegExp | `<!R>` | String pattern (e.g., "/test/gi") |
| Error | `<!E>` | Array: [name, message, stack] |
| undefined | `<!U>` | null |
| Map | `<!M>` | Object from entries |
| Set | `<!S>` | Array of values |
| Circular | `<!P>` | Path array to referenced object |

### `messageHash.js`

Generates deterministic hash strings from message content using the Jenkins one-at-a-time hash algorithm with Crockford Base32 encoding. Used to correlate WebSocket requests with their responses via `queryId`.

- **Algorithm:** Jenkins one-at-a-time hash (32-bit)
- **Encoding:** Crockford Base32 (excludes I, L, O, U for readability)
- **Output:** 1-7 character URL-safe string

### `jss.test.js`

Test suite for JSS serialization. Tests encoding/decoding of all supported types, circular references, and edge cases.

### `messageHash.test.js`

Test suite for message hashing. Tests determinism, collision resistance, and Base32 encoding.

### `parseUserAgent.test.js`

Test suite for the User-Agent parser (implementation in `server/utils/parseUserAgent.js`). Tests browser, OS, device, and bot detection against real User-Agent strings.

### `jss/`

JSS encoder/decoder implementations. See [`jss/files.md`](./jss/files.md).