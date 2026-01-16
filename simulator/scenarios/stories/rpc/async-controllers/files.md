# Async Controllers Test Scenario Files

Tests verifying that async controller methods work correctly.

## Directory Structure

```
async-controllers/
├── index.js
├── delay-returns-after-time.js
└── multiple-async-calls-independent.js
```

## Files

### `index.js`

Test suite registration file that imports and registers all async controller tests.

### `delay-returns-after-time.js`

Tests that an async delay controller returns after the specified time has elapsed.

### `multiple-async-calls-independent.js`

Tests that multiple async RPC calls with different delays complete independently and all return their results.
