# Independent Server Operations Test Scenario Files

Tests verifying that servers in a cluster operate independently.

## Directory Structure

```
independent-server-operations/
├── broadcast-within-same-server-works.js
└── rpc-calls-work-on-each-server-independently.js
```

## Files

### `broadcast-within-same-server-works.js`

Tests that broadcasts between clients connected to the same server in a cluster work correctly.

### `rpc-calls-work-on-each-server-independently.js`

Tests that RPC calls from clients on different servers in a cluster execute independently on their respective servers.
