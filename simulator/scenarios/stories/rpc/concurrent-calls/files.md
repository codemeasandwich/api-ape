# Concurrent Calls Test Scenario Files

Tests verifying that multiple RPC calls can execute concurrently.

## Directory Structure

```
concurrent-calls/
├── index.js
├── concurrent-to-different-endpoints.js
└── many-concurrent-calls.js
```

## Files

### `index.js`

Test suite registration file that imports and registers all concurrent call tests.

### `concurrent-to-different-endpoints.js`

Tests that concurrent calls to different endpoints (echo, users, users/profile) all complete successfully with correct results.

### `many-concurrent-calls.js`

Tests that 20 concurrent calls to the same endpoint all complete correctly with their respective data intact.
