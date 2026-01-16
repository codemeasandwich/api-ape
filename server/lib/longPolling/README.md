# Long Polling Module

## Overview

The longPolling module provides HTTP-based fallback communication when WebSocket connections are unavailable. Many corporate networks, firewalls, and proxy servers block WebSocket connections, so api-ape automatically falls back to HTTP long-polling to maintain real-time bidirectional communication.

**Key capabilities:**

- **Streaming responses** — Server holds GET requests open and streams JSON events as they occur
- **Message posting** — Client sends messages via POST requests with immediate responses
- **Session management** — Tracks clients via `apeClientId` cookie across requests
- **Heartbeat keepalive** — Prevents proxy timeouts with periodic heartbeat messages
- **Connection recycling** — Automatically closes and reopens connections every ~25 seconds
- **Broadcast integration** — Long-polling clients receive broadcasts just like WebSocket clients

The transport is transparent to application code—controllers work identically regardless of whether clients connect via WebSocket or HTTP long-polling.

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

## Response Headers

The GET handler sets these headers for proper streaming:

```
Content-Type: application/json
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no    # Disables nginx/proxy buffering
```

## When Is This Used?

Long-polling activates automatically when:

1. WebSocket connection fails to establish
2. WebSocket upgrade is rejected by a proxy or firewall
3. Network doesn't support the WebSocket protocol
4. Client explicitly requests HTTP transport

## See Also

- [`../longPolling.js`](../longPolling.js) — Main long-polling coordinator
- [`../wiring.js`](../wiring.js) — WebSocket wiring (primary transport)
- [`../broadcast.js`](../broadcast.js) — Client tracking for long-polling clients
- [`../../../client/transports/README.md`](../../../client/transports/README.md) — Client-side streaming transport