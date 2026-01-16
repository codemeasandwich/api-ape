# Simple Calls Test Scenario Files

Tests verifying basic RPC call functionality.

## Directory Structure

```
simple-calls/
├── index.js
├── echo-returns-input-unchanged.js
└── multiple-sequential-calls.js
```

## Files

### `index.js`

Test suite registration file that imports and registers all simple call tests.

### `echo-returns-input-unchanged.js`

Tests that the echo endpoint returns the input data unchanged, including strings, numbers, and nested objects.

### `multiple-sequential-calls.js`

Tests that multiple sequential RPC calls (5 in a row) all complete correctly with their respective data.
