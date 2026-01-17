# 🌲 Forest Cluster Adapters

## Overview

The adapters module provides database integrations for api-ape's Forest distributed mesh system. These adapters enable horizontal scaling by connecting multiple api-ape server instances through a shared backend, allowing clients on different servers to communicate seamlessly.

**Key capabilities:**

- **Client discovery** — Track which server hosts each connected client
- **Message routing** — Route messages directly to the target server (no broadcast spam)
- **Real-time push** — Use database-native pub/sub for instant message delivery
- **Auto-detection** — Automatically detect database type from client instance
- **Zero configuration** — Creates namespaced keys/tables automatically

Supported backends: **Redis** (recommended), **MongoDB**, **PostgreSQL**, **Supabase**, and **Firebase**.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Quick Start

```js
const { ape } = require('api-ape')
const { createClient } = require('redis')

// Connect to your database
const redis = createClient()
await redis.connect()

// Join the cluster — APE creates its own namespace
ape.joinVia(redis)
```

That's it. APE will:
- Detect the database type (Redis, MongoDB, PostgreSQL)
- Create namespaced keys/tables (`ape:*` or `ape_*`)
- Route messages between servers automatically


## How It Works

```
┌─────────────┐                    ┌─────────────┐
│  Server A   │                    │  Server B   │
│  client-1   │                    │  client-2   │
└──────┬──────┘                    └──────▲──────┘
       │                                  │
       │ 1. send("client-2")            │
       │    → lookup.read("client-2")     │
       │    → returns "srv-B"             │
       │                                  │
       │ 2. channels.push("srv-B", msg)   │
       └──────────┬───────────────────────┘
                  │
           ┌──────▼──────┐
           │   Database  │
           │  (message   │
           │    bus)     │
           └─────────────┘
```

Messages are routed **directly** to the server hosting the client. No broadcast spam.


## Adapter Interface

All adapters implement this interface:

```ts
interface AdapterInstance {
  // Lifecycle
  join(serverId: string): Promise<void>;
  leave(): Promise<void>;
  
  // Client → Server mapping
  lookup: {
    add(clientId: string): Promise<void>;
    read(clientId: string): Promise<string | null>;
    remove(clientId: string): Promise<void>;
  };
  
  // Inter-server messaging
  channels: {
    push(serverId: string, message: object): Promise<void>;
    pull(serverId: string, handler: (msg, senderServerId) => void): Promise<() => void>;
  };
}
```


## Supported Databases

### Redis (Recommended)

Best performance. Uses PUB/SUB for real-time messaging.

```js
import { createClient } from 'redis';

const redis = createClient({ url: 'redis://localhost:6379' });
await redis.connect();

ape.joinVia(redis);
```

**Keys created:**
- `ape:client:{clientId}` — client→server mapping
- `ape:channel:{serverId}` — PUB/SUB channel
- `ape:channel:ALL` — broadcast channel


### MongoDB

Uses Change Streams for real-time push (requires replica set).

```js
import { MongoClient } from 'mongodb';

const mongo = new MongoClient('mongodb://localhost:27017');
await mongo.connect();

ape.joinVia(mongo);
```

**Database/Collections created:**
- Database: `ape_cluster`
- Collection: `clients` — client→server mapping
- Collection: `events` — message bus (change streams)


### PostgreSQL

Uses LISTEN/NOTIFY for real-time messaging.

```js
import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgres://localhost/mydb' });

ape.joinVia(pool);
```

**Database/Tables created:**
- Database: `ape_cluster` (or uses existing)
- Table: `clients` — client→server mapping
- Channel: `ape_events` — LISTEN/NOTIFY channel


### Supabase

Uses Supabase Realtime for push messaging. Simple setup if you're already using Supabase.

```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

ape.joinVia(supabase);
```

**Requirements:**
- Create table: `ape_clients (client_id TEXT PRIMARY KEY, server_id TEXT, updated_at TIMESTAMP)`
- Enable Realtime on your project


### Firebase Realtime Database

Native real-time push. Perfect for serverless and edge deployments.

```js
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const app = initializeApp();
const database = getDatabase(app);

ape.joinVia(database);
```

**Paths created:**
- `/ape/clients/{clientId}` — client→server mapping
- `/ape/channels/{serverId}` — message channels
- `/ape/channels/ALL` — broadcast channel


## Custom Adapters

For other databases or testing, pass your own adapter:

```js
ape.joinVia({
  async join(serverId) {
    // Subscribe to channels, register server
  },
  
  async leave() {
    // Cleanup subscriptions, remove client mappings
  },
  
  lookup: {
    async add(clientId) {
      // Map clientId → this serverId
    },
    async read(clientId) {
      // Return serverId or null
    },
    async remove(clientId) {
      // Delete mapping (only if we own it)
    }
  },
  
  channels: {
    async push(serverId, message) {
      // Send to serverId's channel ("" = broadcast)
    },
    async pull(serverId, handler) {
      // Subscribe to serverId's channel
      // handler(message, senderServerId)
      return async () => { /* unsubscribe */ };
    }
  }
});
```


## Options

```js
ape.joinVia(redis, {
  namespace: 'myapp',     // Default: 'ape'
  serverId: 'srv-custom'  // Default: auto-generated UUID
});
```


## Lifecycle

| Event | Adapter Action |
|-------|---------------|
| Server starts | `join(serverId)` — subscribe to channels |
| Client connects | `lookup.add(clientId)` — register mapping |
| Client disconnects | `lookup.remove(clientId)` — delete mapping |
| Server shutdown | `leave()` — cleanup all owned mappings |

### Graceful Shutdown

```js
process.on('SIGINT', async () => {
  await ape.leaveCluster();
  process.exit(0);
});
```


## Message Format

Messages sent via `channels.push`:

```js
// Direct message
{
  destClientId: 'user-123',
  type: 'chat',
  data: { text: 'Hello!' }
}

// Broadcast
{
  type: 'system',
  data: { notice: 'Maintenance in 5 min' }
}

// Broadcast excluding sender
{
  type: 'chat',
  data: { text: 'Hello everyone!' },
  excludeClientId: 'user-456'
}
```

## See Also

- [`../README.md`](../README.md) — Main server documentation
- [`../lib/broadcast.js`](../lib/broadcast.js) — Broadcast utilities used with adapters
- [`../lib/wiring.js`](../lib/wiring.js) — WebSocket connection setup with cluster integration
