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
├── clockOffset.js           # Offset to the server's clock from `__connected__.serverTime`, and the gate that holds queued calls until it arrives
├── clockOffset.test.js      # clockOffset test suite
├── jss.js                   # JSS main entry point (encode/decode/stringify/parse)
├── jss.d.ts                 # Types for `api-ape/jss`
├── jss.test.js              # JSS test suite
├── safeKeys.js              # hasOwn / setKey: the only way peer text indexes an object
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

### `clockOffset.js`

The server's clock, as the bundled clients learn it (4.5.1). `clockOffsetFrom(connected, localNow?)` is `serverTime - localNow` from the `__connected__` frame's data (0 when the server sent no usable `serverTime`: an older server, or a string, `NaN` or `Infinity`); both clients add it to every call's `createdAt`. `createConnectedGate(onSettled, waitMs?)` holds the calls queued while connecting from socket open until `__connected__` arrives (`settle`), or `CONNECTED_WAIT_MS` (1 s) passes with none, so they too are stamped in the server's clock; `cancel` on close. Used by `client/connectSocket.js` and `server/client/connection.js`; no Node APIs, so it bundles for the browser.

### `wireError.js`

How a failed call travels from a controller to its caller. `errorFrame(thrown, type, queryId)` (server) builds the reply `{ err: <Error via JSS>, errCode?, errData?, type, queryId }`: name and message are kept, the stack is replaced by `"Name: message"` so no server paths leak, and the reply always leaves (an unserialisable thrown value arrives as an Error saying so). `errCode` goes only from an own enumerable string/number `code`, `errData` only from own enumerable plain data (no functions, class instances, BigInts, cycles, nesting over 32 or over 10000 objects; shared objects are checked once), and neither from a Node system error (it has `syscall` or `errno`). A thrown plain object never forwards its own `stack`. `attachErrorDetails(err, frame)` (browser and Node clients) puts `code` / `data` back on the Error. `toWireError` normalises strings and Error-shaped objects. Every send passes `errorStacks: false` to the JSS encoder, so an Error anywhere in a reply, push or thrown object travels with the stack `Name: message`. `dataFrame` (a reply or push, `undefined` tagged `data<!U>`) and `keepaliveFrame` complete the set; the WebSocket sender, the long-poll POST reply and the SSE stream all use these, so a call behaves the same on every transport.

### `safeKeys.js`

Property access for names that come from a peer. `hasOwn(obj, key)` is an own-property test that `hasOwnProperty` as a key cannot fool; `setKey(target, key, value)` stores a key without letting `__proto__` replace the prototype. The decoder, the upload/plugin tag cleaners, the controller lookup (`controllers[type]`) and the long-poll lookup all use them: a peer chooses frame types, keys and path segments, and a plain `obj[name]` reaches `constructor` and `valueOf`.

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

### `jss/decode.test.js`

Stories for what a peer can make `jss.parse` do: an `E` tag naming `Worker`, `WebSocket`, `Function`, `Proxy`, `__proto__` or a non-string builds nothing and decodes to a plain `Error`; the standard Error classes (and `AggregateError`) still round-trip; inherited names as tags, `__proto__` as a key and pointer paths such as `constructor.constructor` stay data.

### `jss.test.js`

Test suite for JSS serialization. Tests encoding/decoding of all supported types, circular references, and edge cases.

### `messageHash.test.js`

Test suite for message hashing. Tests determinism, collision resistance, and Base32 encoding.

### `parseUserAgent.test.js`

Test suite for the User-Agent parser (implementation in `server/utils/parseUserAgent.js`). Tests browser, OS, device, and bot detection against real User-Agent strings.

### `jss/`

JSS encoder/decoder implementations. See [`jss/files.md`](./jss/files.md).