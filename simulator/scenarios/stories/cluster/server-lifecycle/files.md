# Server Lifecycle Test Scenario Files

Tests verifying cluster server lifecycle management.

## Directory Structure

```
server-lifecycle/
├── can-close-individual-cluster-server.js
└── cleanup-closes-all-cluster-servers.js
```

## Files

### `can-close-individual-cluster-server.js`

Tests that individual servers within a cluster can be closed independently while others remain running.

### `cleanup-closes-all-cluster-servers.js`

Tests that `harness.cleanup()` properly closes all servers in the cluster and resets the server count to zero.
