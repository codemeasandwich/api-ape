# Actions Module

## Overview

The actions module provides atomic, reusable test operations that perform single steps in test scenarios. Actions are the building blocks that stories compose into complete user journeys.

**Key capabilities:**

- **Broadcast operations** — Send and verify broadcast messages between clients
- **Connection operations** — Connect, disconnect, and manage client connections
- **RPC operations** — Make API calls and handle responses
- **File operations** — Upload and download binary files
- **Lifecycle operations** — Test server lifecycle hooks and callbacks
- **Cluster operations** — Test multi-server Forest functionality
- **JSS operations** — Test complex type serialization
- **Edge case operations** — Test error conditions and edge cases

Each action is a function that takes a context object and performs one operation.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```javascript
const broadcast = require('../actions/broadcast');
const rpc = require('../actions/rpc');
const connection = require('../actions/connection');

// Actions are single operations
await connection.connect({ harness, server });
await rpc.call({ client, endpoint: 'echo', data: { msg: 'hi' } });
await broadcast.expectReceived({ client: bob, type: 'chat' });
```

## See Also

- [`../stories/README.md`](../stories/README.md) — Stories that compose these actions
- [`../../harness/README.md`](../../harness/README.md) — Test infrastructure
