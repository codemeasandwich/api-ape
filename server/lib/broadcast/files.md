# Broadcast Module Files

This module provides client tracking and messaging infrastructure for api-ape servers. It manages connected WebSocket clients and enables broadcasting messages to all clients or publishing to specific pub/sub channels.

## Guidelines

- **Read-only clients Map** — External code accesses `clients` via read-only proxy; mutations are internal only
- **Pub/sub cleanup** — Always use `removeClient()` from index.js to ensure subscription cleanup
- **Last message delivery** — New subscribers automatically receive the last published message for catch-up

## Directory Structure

```
broadcast/
├── clients.js      # Client tracking with read-only proxy
├── index.js        # Module entry point, wires pub/sub cleanup
├── publishProxy.js # Chained publish proxy for fluent syntax
└── pubsub.js       # Channel subscription and publishing
```

## Files

### `clients.js`

Client tracking with a read-only proxy for external access:

- Stores connected clients in a Map keyed by `clientId`
- Creates `ClientWrapper` objects exposing `clientId`, `sessionId`, `embed`, `authState`
- Provides `send(type, data)` method on each wrapper for direct messaging
- Exposes read-only proxy that blocks `set`, `delete`, `clear` operations
- Internal functions: `addClient`, `removeClient`, `updateClientEmbed`, `updateClientSend`, `updateClientAuth`

### `index.js`

Module entry point that re-exports client and pub/sub functions:

- Wires `removeClient` to automatically call `cleanupClientSubscriptions`
- Exports `broadcast(type, data, excludeClientId)` for messaging all clients
- Re-exports pub/sub functions: `subscribe`, `unsubscribe`, `publish`

### `pubsub.js`

Channel-based pub/sub system for targeted messaging:

- `subscribe(clientId, channel)` — Subscribe client, returns last message if available
- `unsubscribe(clientId, channel)` — Remove client from channel
- `publish(channel, data)` — Send message to all channel subscribers
- `cleanupClientSubscriptions(clientId)` — Remove all subscriptions on disconnect
- Stores last published message per channel for late-joining subscribers

### `publishProxy.js`

Creates a Proxy-based API for fluent publish syntax (`ape.publish.news.banking(data)`). Intercepts property access to build channel paths dynamically. Supports both chained syntax and legacy direct function call (`ape.publish('/channel', data)`).
