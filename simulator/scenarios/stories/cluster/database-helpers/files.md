# Database Helpers Test Scenario Files

Tests verifying the FakeDatabase helper methods used for cluster coordination.

## Directory Structure

```
database-helpers/
├── get-state-returns-database-state.js
└── reset-clears-all-database-state.js
```

## Files

### `get-state-returns-database-state.js`

Tests that `harness.db.getState()` returns the current database state including active servers and client count.

### `reset-clears-all-database-state.js`

Tests that `harness.db.reset()` clears all database state including active servers and client connections.
