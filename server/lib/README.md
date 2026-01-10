# Server Lib Module

## Overview

The lib module is the core implementation of api-ape's server functionality. It orchestrates everything needed to transform a standard HTTP server into a real-time WebSocket API server with automatic controller routing, client management, and message handling.

**Key capabilities:**

- **Server initialization** — Detect runtime (Node.js, Bun, Deno) and configure appropriate handlers
- **Controller loading** — Recursively load JavaScript files from a folder and map them to API endpoints
- **WebSocket management** — Handle connections, message routing, and client lifecycle
- **Client tracking** — Maintain registry of connected clients with broadcast capabilities
- **HTTP fallback** — Provide long-polling transport when WebSocket is unavailable
- **File transfers** — Manage binary upload/download with streaming support
- **Runtime abstraction** — Unified API across Node.js, Bun, and Deno

This module is the engine that powers the "drop a file, get an endpoint" developer experience.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## See Also

- [`../README.md`](../README.md) — Server overview and API reference
- [`runtimes/README.md`](./runtimes/README.md) — Runtime-specific integrations
- [`ws/README.md`](./ws/README.md) — WebSocket polyfill documentation
- [`longPolling/README.md`](./longPolling/README.md) — HTTP fallback handlers