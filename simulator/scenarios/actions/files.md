# Actions Module Files

This module provides atomic, reusable test operations that perform single steps in test scenarios. Actions are the building blocks that stories compose into complete user journeys.

## Guidelines

- **Single responsibility** — Each action does exactly one thing
- **Context parameter** — All actions receive a context object with `{ harness, client, server, expect }` as needed
- **Return values** — Return useful results that callers can assert on
- **No side effects** — Don't modify state outside the action's scope
- **Reusable** — Actions should work in any story context

## Directory Structure

```
actions/
├── broadcast/        # Broadcast message operations
├── cluster/          # Multi-server cluster operations
├── connection/       # Connection lifecycle operations
├── edge-cases/       # Edge case testing operations
├── files/            # File transfer operations
├── jss/              # JSS type testing operations
├── lifecycle/        # Server lifecycle operations
└── rpc/              # RPC call operations
```

## Directories

### `broadcast/`

Operations for sending and verifying broadcast messages. Includes `toAll`, `toOthers`, `expectReceived`, `expectNotReceived`, and verification helpers. See [`broadcast/files.md`](./broadcast/files.md).

### `cluster/`

Operations for multi-server Forest cluster testing. Includes cluster creation, cross-server messaging, and client routing verification. See [`cluster/files.md`](./cluster/files.md).

### `connection/`

Operations for client connection lifecycle. Includes connect, disconnect, reconnect, and state verification. See [`connection/files.md`](./connection/files.md).

### `edge-cases/`

Operations for testing error conditions and edge cases. Includes timeout handling, large payloads, rapid requests, and error scenarios. See [`edge-cases/files.md`](./edge-cases/files.md).

### `files/`

Operations for binary file transfers. Includes upload, download, and client-to-client file sharing. See [`files/files.md`](./files/files.md).

### `jss/`

Operations for testing JSS type serialization. Includes round-trip tests for Date, RegExp, Error, Set, Map, and undefined. See [`jss/files.md`](./jss/files.md).

### `lifecycle/`

Operations for testing server lifecycle hooks. Includes onConnect, onDisconnect, embed values, and callback verification. See [`lifecycle/files.md`](./lifecycle/files.md).

### `rpc/`

Operations for making RPC calls. Includes simple calls, nested routes, error handling, and concurrent requests. See [`rpc/files.md`](./rpc/files.md).
