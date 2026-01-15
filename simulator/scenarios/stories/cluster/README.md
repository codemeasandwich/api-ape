# Cluster Stories Module

## Overview

The cluster stories module contains test suites for api-ape's Forest distributed mesh functionality. These tests verify multi-server setups using the fake in-memory database adapter.

**Key capabilities:**

- **Multi-server setup** — Create and manage clusters of servers
- **Independent operations** — Verify each server works independently
- **Shared database** — Test fake database adapter functionality
- **Server lifecycle** — Test server join/leave cluster behavior
- **Database helpers** — Test database state access and reset

These stories exercise `adapters/`, Forest coordination, and the fake database.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## See Also

- [`../README.md`](../README.md) — Stories overview
- [`../../actions/cluster/README.md`](../../actions/cluster/README.md) — Cluster actions
- [`../../../harness/fake-db.js`](../../../harness/fake-db.js) — Fake database
