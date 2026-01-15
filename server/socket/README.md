# Socket Module

## Overview

The socket module handles WebSocket message processing for api-ape servers. It manages the complete lifecycle of messages flowing between clients and controllers—from initial connection validation through message parsing, controller invocation, and response serialization.

**Key capabilities:**

- **Connection validation** — Verify origin headers and enforce security policies before accepting connections
- **Message parsing** — Deserialize incoming WebSocket messages with JSS encoding support
- **Controller routing** — Route messages to the appropriate controller based on the `type` field
- **Pub/sub handling** — Process `subscribe` and `unsubscribe` messages for channel subscriptions
- **Binary data coordination** — Detect upload tags, wait for HTTP uploads, and inject binary data into messages
- **Response serialization** — Serialize controller responses and handle binary data with download links
- **Request correlation** — Match responses to requests via `queryId` for Promise resolution on the client

This module is the bridge between raw WebSocket frames and the high-level controller functions that developers write.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Message Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      Incoming Message                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WebSocket Frame                                                 │
│       │                                                          │
│       ▼                                                          │
│  receive.js                                                      │
│       │ Parse JSS → { type, data, queryId }                      │
│       │ Find upload tags → [{ path, hash, tag }]                 │
│       │ Wait for HTTP uploads (if any)                           │
│       │ Inject binary data at paths                              │
│       ▼                                                          │
│  Controller                                                      │
│       │ this = { clientId, sessionId, broadcast, ...embed }      │
│       │ return result                                            │
│       ▼                                                          │
│  send.js                                                         │
│       │ Detect Buffers → register downloads → add <!L> tags      │
│       │ Serialize with JSS                                       │
│       ▼                                                          │
│  WebSocket Frame → Client                                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## See Also

- [`../lib/wiring.js`](../lib/wiring.js) — WebSocket connection setup that calls these handlers
- [`../lib/fileTransfer.js`](../lib/fileTransfer.js) — Binary file transfer coordination
- [`../security/README.md`](../security/README.md) — Origin validation used by `open.js`
- [`tagUtils.js` JSDoc](./tagUtils.js) — Detailed tag system documentation