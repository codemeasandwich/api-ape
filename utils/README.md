# 🦍 api-ape Utils

## Overview

The utils module provides shared serialization and hashing utilities used by both client and server components of api-ape. These utilities enable the framework's ability to transparently handle complex JavaScript types over WebSocket connections.

**Key capabilities:**

- **JSS (JSON Super Set)** — Extended JSON serialization supporting Date, RegExp, Error, Map, Set, undefined, and circular references
- **Message Hashing** — Deterministic hash generation for request/response correlation over bidirectional channels
- **Browser & Server Compatible** — Designed to work identically in browser and Node.js/Bun/Deno environments

These utilities are the foundation that allows api-ape to feel like native function calls despite operating over WebSocket.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## See Also

- [`jss/README.md`](./jss/README.md) — JSS encoder/decoder implementation details
- [`../client/connection/sender.js`](../client/connection/sender.js) — Client-side message hashing usage
- [`../server/socket/receive.js`](../server/socket/receive.js) — Server-side message processing