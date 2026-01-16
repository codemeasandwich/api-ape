# Cluster Stories Module Files

This module contains test suites for api-ape's Forest distributed mesh functionality. These tests verify multi-server setups using the fake in-memory database adapter.

## Guidelines

- **Shared FakeDatabase** — All servers in a cluster must share one FakeDatabase instance
- **Unique ports** — Each server needs a unique port; use harness port allocation
- **Cleanup order** — Close clients before servers, then reset database
- **Async timing** — Cross-server messages use `setImmediate`; brief waits may be needed

## Directory Structure

```
cluster/
├── index.test.js                    # Main test file that imports all scenarios
├── multi-server-setup/              # Tests for creating server clusters
├── independent-server-operations/   # Tests for per-server functionality
├── shared-fake-database/            # Tests for shared database behavior
├── server-lifecycle/                # Tests for server join/leave
└── database-helpers/                # Tests for database state access
```

## Directories

### `multi-server-setup/`

Tests for creating and configuring multi-server clusters, including port allocation and client connectivity.

### `independent-server-operations/`

Tests verifying each server in a cluster operates correctly on its own, including RPC and broadcasts.

### `shared-fake-database/`

Tests for the shared FakeDatabase behavior, verifying servers see each other's client registrations.

### `server-lifecycle/`

Tests for server join and leave operations, including cleanup of client mappings.

### `database-helpers/`

Tests for database state access methods like `getState()` and `reset()`.
