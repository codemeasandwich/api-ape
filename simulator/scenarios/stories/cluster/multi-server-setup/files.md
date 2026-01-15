# Multi Server Setup Test Scenario Files

Tests verifying cluster creation and basic multi-server configuration.

## Directory Structure

```
multi-server-setup/
├── can-create-cluster-of-servers.js
├── clients-can-connect-to-different-servers.js
└── each-server-has-unique-port.js
```

## Files

### `can-create-cluster-of-servers.js`

Tests that `harness.createCluster()` creates the specified number of servers, each with a valid URL and not closed.

### `clients-can-connect-to-different-servers.js`

Tests that clients can successfully connect to different servers within a cluster and each server tracks its own client count.

### `each-server-has-unique-port.js`

Tests that each server in a cluster is assigned a unique port number.
