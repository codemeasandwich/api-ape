# Lifecycle Actions Module

## Overview

The lifecycle actions module provides atomic operations for testing api-ape's server lifecycle hooks and callbacks. These actions test the `onConnect` callback, embed values, and disconnect handling.

**Key capabilities:**

- **Server configuration** — Create servers with various onConnect configurations
- **Embed testing** — Verify embedded values are accessible in controllers
- **Hook verification** — Test onReceive, onSend, onError, onDisconnect callbacks
- **Event tracking** — Track and verify lifecycle events

These operations test the connection lifecycle from handshake to cleanup.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```javascript
const lifecycle = require('../actions/lifecycle');

// Create server with embed
const server = await lifecycle.createServerWithEmbed({
  harness,
  embed: { userId: 'user-123', role: 'admin' }
});

// Verify embed accessible in controller
await lifecycle.verifyEmbed({ client, endpoint: 'users/profile', embedKey: 'userId' });

// Create server that sends welcome message
const server = await lifecycle.createServerWithWelcome({
  harness,
  welcomeType: 'welcome',
  welcomeData: { message: 'Hello!' }
});
```

## See Also

- [`../README.md`](../README.md) — Actions overview
- [`../../stories/lifecycle/README.md`](../../stories/lifecycle/README.md) — Lifecycle user stories
