# WebSocket Polyfill Module Files

This module provides a zero-dependency, RFC 6455 compliant WebSocket implementation for api-ape. It serves as a fallback when native WebSocket support is unavailable, ensuring api-ape works across all Node.js versions without requiring external packages.

## Guidelines

- **RFC 6455 compliance** — All changes must maintain full compliance with the WebSocket protocol specification
- **Zero dependencies** — Never add external packages; this is a pure JavaScript implementation
- **ws library API** — Maintain compatibility with the popular `ws` package API for drop-in replacement
- **Frame handling** — All frame encoding/decoding logic lives in `frames.js`; don't duplicate elsewhere
- **Control frames** — Always respond to ping frames with pong; handle close frames gracefully
- **Runtime adapters** — Bun and Deno adapters live in `adapters/`; they normalize native APIs to the ws interface

## Directory Structure

```
ws/
├── index.js      # Module entry point (exports WebSocketServer, WebSocket, constants)
├── frames.js     # RFC 6455 frame encoding/decoding
├── socket.js     # WebSocket connection class
├── server.js     # WebSocketServer class
├── ws.test.js    # WebSocket polyfill test suite
└── adapters/     # Runtime-specific WebSocket adapters (Bun, Deno)
```

## Files

### `index.js`

Module entry point that exports:

- `WebSocketServer` — Server for accepting WebSocket connections
- `WebSocket` — Connection class wrapping TCP socket with frame protocol
- `READY_STATES` — Connection state constants (CONNECTING, OPEN, CLOSING, CLOSED)
- `OPCODES` — Frame type constants (TEXT, BINARY, CLOSE, PING, PONG)

### `frames.js`

RFC 6455 frame protocol implementation:

- `parseFrame(buffer)` — Parse incoming WebSocket frames from raw bytes
- `buildFrame(data, opcode)` — Build outgoing frames for transmission
- `buildCloseFrame(code, reason)` — Build connection close frames
- `buildPongFrame(payload)` — Build pong response to ping frames
- `generateAcceptKey(key)` — Generate Sec-WebSocket-Accept header for handshake
- `unmaskPayload(payload, mask)` — Unmask client-to-server frame payloads

### `socket.js`

WebSocket connection class:

- Wraps raw TCP socket with WebSocket frame protocol
- Handles message fragmentation and reassembly
- Automatically responds to ping frames with pong
- Manages connection state transitions (OPEN → CLOSING → CLOSED)
- Emits `message`, `close`, and `error` events

### `server.js`

WebSocketServer class:

- Handles HTTP upgrade requests for WebSocket connections
- Validates Sec-WebSocket-Key header per RFC 6455
- Sends 101 Switching Protocols response
- Manages connected clients via `clients` Set
- Emits `connection` event with WebSocket instance and request

### `ws.test.js`

Test suite for the WebSocket polyfill. Tests frame encoding/decoding, connection lifecycle, and protocol compliance.

### `adapters/`

Runtime-specific WebSocket adapters for Bun and Deno. See [`adapters/files.md`](./adapters/files.md).