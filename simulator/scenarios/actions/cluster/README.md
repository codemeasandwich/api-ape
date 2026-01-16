# Cluster Actions Module

## Overview

The cluster actions module provides atomic operations for testing api-ape's Forest distributed mesh functionality. These actions enable multi-server testing with the fake in-memory database adapter.

**Key capabilities:**

- **Cluster creation** — Spawn multiple servers sharing a fake database
- **Client distribution** — Connect clients to different servers in the cluster
- **Cross-server messaging** — Verify messages route between servers
- **Database operations** — Direct access to fake database for verification
- **Lifecycle management** — Shutdown individual servers or entire cluster

All cluster operations use the fake database adapter, enabling full Forest testing without real databases.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```javascript
const cluster = require('../actions/cluster');

// Create a cluster of 3 servers
const { servers, db } = await cluster.createCluster({ harness, count: 3 });

// Connect clients to different servers
const client1 = await cluster.connectToServer({ harness, server: servers[0] });
const client2 = await cluster.connectToServer({ harness, server: servers[1] });

// Verify cross-server broadcast works
await cluster.distributeClients({ harness, servers, clientsPerServer: 2 });
```

## See Also

- [`../README.md`](../README.md) — Actions overview
- [`../../stories/cluster/README.md`](../../stories/cluster/README.md) — Cluster user stories
- [`../../../harness/fake-db.js`](../../../harness/fake-db.js) — Fake database implementation
