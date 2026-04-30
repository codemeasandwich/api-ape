# Long Polling Module Files

This module provides HTTP-based fallback communication when WebSocket connections are unavailable. Many corporate networks, firewalls, and proxy servers block WebSocket connections, so api-ape automatically falls back to HTTP long-polling to maintain real-time bidirectional communication.

## Guidelines

- **Mirror WebSocket behavior** — Long-polling clients must receive the same events and controller context as WebSocket clients
- **Session via cookies** — Always use `apeClientId` cookie for LP transport identity; never rely on request parameters for LP routing (distinct from WebSocket **`sessionId`** logical pairing — Phase 1 WS mint/pairing lives in **`sessionIdentity.js`** / **`wiring`**)
- **Heartbeat timing** — Send heartbeats every 20 seconds; close connections after 25 seconds to avoid proxy timeouts
- **Streaming headers** — Set `X-Accel-Buffering: no` to disable nginx/proxy buffering
- **JSS encoding** — Use `utils/jss` for all message parsing/serialization; match WebSocket behavior exactly
- **Broadcast integration** — Register long-polling clients with `broadcast.js` just like WebSocket clients

## Directory Structure

```
longPolling/
├── getHandler.js    # HTTP GET streaming response handler
└── postHandler.js   # HTTP POST message handler
```

## Files

### `getHandler.js`

Creates the HTTP GET handler for streaming server-to-client events:

- Holds HTTP connection open with streaming headers
- Sends JSON events to the response stream as they occur
- Emits heartbeat every 20 seconds to keep connection alive
- Closes connection after 25 seconds (client automatically reconnects)
- Manages client identity via `apeClientId` cookie (HTTP LP channel)
- Uses **`sessionIdentity.effectiveSessionIdForRequest`** so **`sessionId`** is never absent on the broadcast row; **`__connected__`** echoes **`{ clientId, sessionId }`** like WebSocket (cookie/header pairing for hybrid scenarios)
- Registers clients with broadcast system for event delivery
- Calls `onConnect` callback with lifecycle hooks

### `postHandler.js`

Creates the HTTP POST handler for client-to-server messages:

- Parses JSON body with JSS encoding support (Date, Set, Map, etc.)
- Validates client session from `apeClientId` cookie
- Routes messages to appropriate controllers based on `type` field
- Returns controller response in JSON format
- Provides same controller context (`this`) as WebSocket handlers