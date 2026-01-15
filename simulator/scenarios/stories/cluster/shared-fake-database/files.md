# Shared Fake Database Test Scenario Files

Tests verifying that each harness instance has its own FakeDatabase for cluster coordination.

## Directory Structure

```
shared-fake-database/
├── clients-can-connect-to-servers-in-cluster.js
└── each-harness-has-own-fake-database-instance.js
```

## Files

### `clients-can-connect-to-servers-in-cluster.js`

Tests that multiple clients can connect to servers in a cluster and make successful RPC calls.

### `each-harness-has-own-fake-database-instance.js`

Tests that the harness provides a FakeDatabase instance with required methods like `joinServer` and `publish`.
