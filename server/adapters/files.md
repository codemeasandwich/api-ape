# Forest Adapters Module Files

This module provides database integrations for api-ape's Forest distributed mesh system. Adapters enable horizontal scaling by connecting multiple api-ape server instances through a shared backend.

## Guidelines

- **Implement the adapter interface** — All adapters must implement `join`, `leave`, `lookup` (add/read/remove), and `channels` (push/pull)
- **Auto-detection** — Add detection logic to `index.js` when creating new adapters
- **Namespacing** — Always use the configured namespace (default: `ape`) for keys/tables/channels
- **Cleanup on leave** — Remove only client mappings owned by this server; don't delete other servers' data
- **Real-time push** — Use database-native pub/sub when available (Redis PUB/SUB, Postgres LISTEN/NOTIFY, etc.)
- **Error handling** — Gracefully handle connection failures; log errors but don't crash the server

## Directory Structure

```
adapters/
├── index.js        # Adapter auto-detection and common interface
├── index.test.js   # Adapter test suite
├── redis.js        # Redis adapter (PUB/SUB)
├── mongo.js        # MongoDB adapter (Change Streams)
├── postgres.js     # PostgreSQL adapter (LISTEN/NOTIFY)
├── supabase.js     # Supabase adapter (Realtime)
└── firebase.js     # Firebase Realtime Database adapter
```

## Files

### `index.js`

Adapter auto-detection and common interface. Detects database type from client instance and returns the appropriate adapter. Entry point for `ape.joinVia(client)`.

### `redis.js`

Redis adapter using PUB/SUB for real-time messaging:
- **Keys:** `ape:client:{clientId}` for client→server mapping
- **Channels:** `ape:channel:{serverId}` for direct messaging, `ape:channel:ALL` for broadcasts
- Best performance option for most deployments

### `mongo.js`

MongoDB adapter using Change Streams for real-time push:
- **Database:** `ape_cluster`
- **Collections:** `clients` (mapping), `events` (message bus)
- Requires replica set for Change Streams support

### `postgres.js`

PostgreSQL adapter using LISTEN/NOTIFY for real-time messaging:
- **Table:** `ape_clients` for client→server mapping
- **Channel:** `ape_events` for pub/sub messaging
- Creates table automatically on first join

### `supabase.js`

Supabase adapter using Supabase Realtime for push messaging:
- **Table:** `ape_clients` (must be created manually with Realtime enabled)
- Requires Supabase project with Realtime feature enabled

### `firebase.js`

Firebase Realtime Database adapter with native real-time push:
- **Paths:** `/ape/clients/{clientId}`, `/ape/channels/{serverId}`, `/ape/channels/ALL`
- Perfect for serverless and edge deployments

### `index.test.js`

Test suite for adapter interface compliance. Tests `join`, `leave`, `lookup`, and `channels` operations across all adapters.