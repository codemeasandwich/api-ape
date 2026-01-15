# Stories Module Files

This module contains complete user journey test suites organized by feature area. Stories compose atomic actions into realistic scenarios that prove api-ape works as documented.

## Guidelines

- **Harness per test** — Create fresh `Harness` instance in `beforeEach`, cleanup in `afterEach`
- **Import test functions** — Each scenario is a separate file imported by `index.test.js`
- **Pass context** — Pass `{ harness, expect }` to test functions
- **Short timeouts** — Set `jest.setTimeout(5000)` for local testing
- **Document coverage** — Note which code paths each story exercises

## Directory Structure

```
stories/
├── broadcast/            # Broadcast messaging test suites
├── chat-app/             # Chat application journey tests
├── cluster/              # Multi-server Forest test suites
├── end-to-end/           # Comprehensive cross-feature tests
├── file-sharing/         # Binary file transfer test suites
├── lifecycle/            # Connection lifecycle test suites
└── rpc/                  # RPC functionality test suites
```

## Directories

### `broadcast/`

Test suites for broadcast messaging functionality. Tests `broadcast()`, `broadcastOthers()`, and message delivery to multiple clients. See [`broadcast/files.md`](./broadcast/files.md).

### `chat-app/`

Complete chat application user journey tests. Tests realistic multi-user scenarios with messaging, presence, and file sharing. See [`chat-app/files.md`](./chat-app/files.md).

### `cluster/`

Test suites for Forest distributed mesh functionality. Tests multi-server setup, cross-server messaging, and database adapters. See [`cluster/files.md`](./cluster/files.md).

### `end-to-end/`

Comprehensive end-to-end test suites covering cross-feature scenarios. Tests edge cases, error handling, and complex type handling. See [`end-to-end/files.md`](./end-to-end/files.md).

### `file-sharing/`

Test suites for binary file transfer functionality. Tests upload, download, and client-to-client file sharing. See [`file-sharing/files.md`](./file-sharing/files.md).

### `lifecycle/`

Test suites for connection lifecycle functionality. Tests `onConnect`, embed values, hooks, and disconnect handling. See [`lifecycle/files.md`](./lifecycle/files.md).

### `rpc/`

Test suites for RPC functionality. Tests simple calls, nested routes, async controllers, error handling, and JSS types. See [`rpc/files.md`](./rpc/files.md).
