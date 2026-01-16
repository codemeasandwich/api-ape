# Connection Actions Module

## Overview

The connection actions module provides atomic operations for managing client connections in api-ape tests. These actions handle the full connection lifecycle from connect to disconnect.

**Key capabilities:**

- **Connection management** — Connect, disconnect, and reconnect clients
- **Batch operations** — Connect or disconnect multiple clients at once
- **State verification** — Assert connection states and client counts
- **Lifecycle tracking** — Wait for connection/disconnection events

All connection operations complete instantly in the local test environment.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```javascript
const connection = require('../actions/connection');

// Connect a client
const client = await connection.connect({ harness, server });

// Verify state
await connection.assertConnected({ client });

// Disconnect
await connection.disconnect({ client });
await connection.assertDisconnected({ client });
```

## See Also

- [`../README.md`](../README.md) — Actions overview
- [`../../stories/lifecycle/README.md`](../../stories/lifecycle/README.md) — Connection lifecycle stories
