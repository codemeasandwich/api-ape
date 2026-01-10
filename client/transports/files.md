# Transports Module Files

This module provides HTTP-based fallback communication when WebSocket connections are unavailable. The transport layer is transparent to the application—API calls work identically whether using WebSocket or HTTP streaming.

## Guidelines

- **Mirror WebSocket behavior** — HTTP transport must emit the same events and behave identically to WebSocket
- **Session persistence** — Always use `apeClientId` cookie for client identity across requests
- **Chunked parsing** — Handle partial JSON data; messages may arrive in fragments
- **Heartbeat handling** — Filter `__heartbeat__` messages; don't expose them to application code
- **Reconnection** — Streams close every ~25 seconds; reconnection must be seamless

## Directory Structure

```
transports/
├── streamParser.js   # HTTP streaming response parser
└── streaming.js      # Long-polling/streaming transport
```

## Files

### `streaming.js`

Implements the HTTP streaming transport as a WebSocket alternative:

- Opens a long-lived GET request to `/api/ape/poll` for receiving events
- Sends client messages via POST requests to `/api/ape/poll`
- Handles automatic reconnection when streams close (every ~25 seconds)
- Manages session identity via `apeClientId` cookie
- Provides the same event interface as the WebSocket transport

### `streamParser.js`

Parses the streaming HTTP response format:

- Handles chunked transfer encoding from the server
- Buffers partial data until complete JSON messages arrive
- Parses newline-delimited JSON events
- Detects and filters heartbeat messages (`__heartbeat__`)
- Extracts message type, data, and error fields