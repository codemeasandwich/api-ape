# Client Transports Module

## Overview

The transports module provides HTTP-based fallback communication when WebSocket connections are unavailable. Many corporate networks, firewalls, and proxies block WebSocket connections, so api-ape automatically falls back to HTTP long-polling to maintain real-time communication.

This transport layer is transparent to the application—the same `api.users.list()` calls work regardless of whether the underlying connection uses WebSocket or HTTP streaming.

**Key capabilities:**

- **HTTP streaming** — Long-lived GET requests receive server events in real-time
- **Message posting** — POST requests send client messages to the server
- **Automatic fallback** — Seamlessly activates when WebSocket fails
- **Session management** — Maintains client identity via cookies
- **Chunked parsing** — Handles streaming response data efficiently

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                       Client                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  GET /api/ape/poll ──────────────────► Streaming Response   │
│  (reconnects every ~25s)                ◄── JSON events     │
│                                         ◄── Heartbeats      │
│                                                             │
│  POST /api/ape/poll ─────────────────► Request/Response     │
│  { type: '/users/list', data: {} }                          │
│                                         ◄── { data: [...] } │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## When Is This Used?

The streaming transport activates automatically when:

1. WebSocket connection fails to establish
2. WebSocket upgrade is rejected by a proxy
3. Network doesn't support the WebSocket protocol
4. Corporate firewall blocks WebSocket traffic

## See Also

- [`../README.md`](../README.md) — Client module overview
- [`../connection/README.md`](../connection/README.md) — Connection management
- [`../../server/lib/longPolling/README.md`](../../server/lib/longPolling/README.md) — Server-side handlers