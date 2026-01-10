# Client Connection Module

## Overview

The connection module handles the core mechanics of maintaining a WebSocket connection to an api-ape server. It manages the full lifecycle of client-server communication including connection state, message sending, request/response correlation, and binary file transfers.

This module powers the seamless API experience where `api.users.list()` transparently becomes a WebSocket message, waits for the response, and returns the result as a Promise—all while handling reconnection, queuing, and binary data automatically.

**Key capabilities:**

- **Connection state management** — Track and expose connection status (offline, connecting, connected, disconnected, walled)
- **Proxy API generation** — Convert `api.path.method()` calls into WebSocket messages
- **Request correlation** — Match responses to requests via `queryId`
- **Network detection** — Detect offline state, captive portals, and connectivity changes
- **File transfers** — Handle binary uploads and downloads transparently

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## See Also

- [`../README.md`](../README.md) — Client module overview
- [`../transports/README.md`](../transports/README.md) — HTTP fallback transport
- [`../connectSocket.js`](../connectSocket.js) — Main WebSocket client