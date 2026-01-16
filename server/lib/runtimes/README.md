# Runtimes Module

## Overview

The runtimes module provides runtime-specific server initialization for api-ape. Different JavaScript runtimes (Node.js, Bun, Deno) have fundamentally different server architectures, and this module abstracts those differences to provide a unified api-ape experience across all platforms.

**Key capabilities:**

- **Runtime detection** — Identify whether the server is Node.js, Bun, or Deno
- **Handler injection** — Add api-ape routes to existing HTTP servers without disrupting existing handlers
- **WebSocket setup** — Configure WebSocket upgrades appropriate for each runtime
- **Route handling** — Serve client bundles, handle file transfers, and manage long-polling endpoints

Each runtime has unique characteristics:
- **Node.js** uses event-based HTTP servers with explicit upgrade handling
- **Bun** uses a fetch/websocket handler pattern with `server.reload()` for hot injection
- **Deno** uses `Deno.upgradeWebSocket()` with Response-based request handling

This module ensures that `ape(server, { where: 'api' })` works identically regardless of the underlying runtime.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Routes Handled

Both runtime modules handle these api-ape routes:

| Path | Method | Description |
|------|--------|-------------|
| `/{where}/ape` | WS | WebSocket upgrade endpoint |
| `/{where}/ape.js` | GET | Client JavaScript bundle |
| `/{where}/ape.js.map` | GET | Source map for debugging |
| `/{where}/ape/ping` | GET | Health check endpoint |
| `/{where}/ape/poll` | GET | Long-polling streaming endpoint |
| `/{where}/ape/poll` | POST | Long-polling message endpoint |
| `/{where}/ape/data/:hash` | GET | Binary file download |
| `/{where}/ape/data/:qid/:hash` | PUT | Binary file upload |

## See Also

- [`../main.js`](../main.js) — Entry point that selects the appropriate runtime
- [`../wsProvider.js`](../wsProvider.js) — Runtime detection utilities
- [`../ws/adapters/`](../ws/adapters/) — Runtime-specific WebSocket adapters