# Broadcast Actions Module

## Overview

The broadcast actions module provides atomic operations for sending and verifying broadcast messages in api-ape tests. Broadcasts are server-pushed messages to connected clients.

**Key capabilities:**

- **Send broadcasts** — `toAll()` and `toOthers()` for different broadcast patterns
- **Verify receipt** — `expectReceived()`, `expectNotReceived()`, and data matching
- **Message management** — Get, clear, and count received messages
- **Compound verification** — Verify complete broadcast scenarios in one call

All operations execute instantly in the virtual environment (no network delay).

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```javascript
const broadcast = require('../actions/broadcast');

// Send broadcast to all clients
await broadcast.toAll({ server, type: 'announcement', data: { msg: 'hi' } });

// Send broadcast to others (excludes sender)
await broadcast.toOthers({ sender: alice, type: 'chat', data: { text: 'hello' } });

// Verify receipt
await broadcast.expectReceived({ client: bob, type: 'chat' });
await broadcast.expectNotReceived({ client: alice, type: 'chat' });
```

## See Also

- [`../README.md`](../README.md) — Actions overview
- [`../../stories/broadcast/README.md`](../../stories/broadcast/README.md) — Broadcast user stories
