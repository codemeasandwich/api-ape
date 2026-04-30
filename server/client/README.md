# Server Client Module

## Overview

The server client module enables api-ape servers to act as WebSocket clients, connecting outbound to other api-ape servers or WebSocket endpoints. This is essential for server-to-server communication in distributed architectures.

**Key capabilities:**

- **Outbound connections** — Connect to other api-ape servers or WebSocket endpoints
- **Proxy-based API** — Same `api.users.list()` syntax as the browser client
- **Auto-reconnection** — Automatic reconnection with exponential backoff
- **Message queuing** — Queues messages during disconnection periods
- **Logical reconnect (Phase 1)** — After `__connected__`, the client remembers `clientId` and `sessionId`; reconnect URLs include **`?resume=<clientId>`** and **`Cookie: sessionId=…`** so the remote server can validate `(sessionId, clientId)` within `APE_RESUME_TTL_MS` ([Server README: Phase 1](../README.md#websocket-logical-reconnect-phase-1))
- **Fast-fail on disconnect** — Pending RPC callbacks are rejected immediately when the socket closes, with diagnostic error messages including the server URL, pending request count, and actionable fix steps
- **Diagnostic error logging** — WebSocket errors log the server URL, pending request count, and numbered fix steps (health check commands, log inspection, firewall diagnosis, timeout configuration)
- **JSS encoding** — Full support for Date, Set, Map, and other extended types

The client provides the same proxy-based API as the browser client (`api.users.list()`), making server-to-server calls feel like local function calls.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Framework logging

Outbound **Node.js** clients share the same internal logger as the server. WebSocket error diagnostics, reconnection summaries, and related messages honor `configureApeLogging`.

The default `require('api-ape')` export is the RPC **proxy**; `configureLogging` is a **named** export on the same package (not a property of the proxy). Use either the root package or this module:

```js
const { configureApeLogging } = require('api-ape')
const { connect } = require('api-ape/server/client')

configureApeLogging(false)
connect('other-host', 3000)

// Or pass logging only for this connect:
connect('other-host', 3000, { logging: false })
```

Equivalent when you already load the server client entry:

```js
const { connect, configureLogging } = require('api-ape/server/client')

configureLogging(false)
connect('other-host', 3000)
```

Process-wide (before `ape()` or `connect()`): `require('api-ape').configureApeLogging(false)` works because it is attached to the CommonJS exports object.

See [Server README: Framework logging](../README.md#framework-logging) and [Browser client](../../client/README.md#framework-logging).

## Logical reconnect (Phase 1)

Outbound connections mirror the browser contract:

1. First successful attach — parse **`__connected__`** and retain **`clientId`** + **`sessionId`** for subsequent upgrades.
2. On auto-reconnect — append **`resume`** to the configured **`APE_SERVER`** / `ws://host:port/...` URL and send **`Cookie: sessionId=<value>`** (api-ape's server-side WebSocket implementation accepts handshake options including headers).
3. Changing target host/port via **`connect(host, port)`** clears stored logical ids so you do not resume across unrelated servers.

Optional handshake headers **`x-ape-session-id`** and **`x-ape-resume`** are accepted by the server when cookie/query ergonomics differ.

## Usage

```js
const { api } = require('api-ape/server/client')

// Connect to another api-ape server
const remote = api('ws://other-server:3000/api/ape')

// Call remote endpoints (returns Promise)
const users = await remote.users.list({ limit: 10 })

// Listen for broadcasts from remote server
remote.on('notification', ({ data }) => {
  console.log('Remote notification:', data)
})

// Disconnect when done
remote.disconnect()
```

## See Also

- [`../README.md`](../README.md) — Main server documentation
- [`../../client/README.md`](../../client/README.md) — Browser client documentation
- [`../adapters/README.md`](../adapters/README.md) — Forest distributed mesh (alternative for multi-server)