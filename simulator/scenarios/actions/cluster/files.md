# Cluster Actions Module Files

This module provides atomic operations for testing api-ape's Forest distributed mesh functionality. These actions enable multi-server testing with the fake in-memory database adapter.

## Guidelines

- **Shared database** — All servers in a cluster must share the same FakeDatabase instance
- **Unique server IDs** — Each server needs a unique serverId for proper routing
- **Cleanup order** — Disconnect clients before shutting down servers
- **Async delivery** — Cross-server messages use `setImmediate()`, so allow brief wait

## Directory Structure

```
cluster/
├── index.js                # Module entry point, re-exports all actions
├── createCluster.js        # Create multi-server cluster with shared fake DB
├── connectToServer.js      # Connect a client to a specific server
├── distributeClients.js    # Connect multiple clients across servers
├── shutdownServer.js       # Shutdown a single server in the cluster
├── shutdownAll.js          # Shutdown all servers and cleanup
├── getServerState.js       # Get state info for a server
├── getTotalClientCount.js  # Count total clients across all servers
├── assertServerCount.js    # Assert number of active servers
├── assertTotalClients.js   # Assert total client count across cluster
├── getDatabaseState.js     # Get fake database state for debugging
├── resetDatabase.js        # Reset fake database state
├── publishToDatabase.js    # Directly publish to fake DB (testing)
├── subscribeToDatabase.js  # Directly subscribe to fake DB (testing)
└── waitForDatabaseSync.js  # Wait for cross-server message delivery
```

## Files

### `index.js`

Module entry point that re-exports all cluster actions for convenient importing.

### `createCluster.js`

Creates a cluster of api-ape servers sharing a FakeDatabase instance. Returns servers array and database reference.

### `connectToServer.js`

Connects a client to a specific server in the cluster. Handles URL and path configuration.

### `distributeClients.js`

Connects multiple clients evenly distributed across cluster servers.

### `shutdownServer.js`

Gracefully shuts down a single server in the cluster, closing its client connections.

### `shutdownAll.js`

Shuts down all servers in the cluster and resets the shared database.

### `getServerState.js`

Returns state information for a server including client count and connection status.

### `getTotalClientCount.js`

Returns total number of connected clients across all servers in the cluster.

### `assertServerCount.js`

Asserts that the cluster has exactly N active servers.

### `assertTotalClients.js`

Asserts that total client count across all servers equals expected value.

### `getDatabaseState.js`

Returns the fake database state including client mappings and active servers.

### `resetDatabase.js`

Resets the fake database, clearing all client mappings and subscriptions.

### `publishToDatabase.js`

Directly publishes a message to the fake database for testing adapter behavior.

### `subscribeToDatabase.js`

Directly subscribes to the fake database for testing adapter behavior.

### `waitForDatabaseSync.js`

Waits for cross-server message delivery to complete (handles async `setImmediate` timing).
