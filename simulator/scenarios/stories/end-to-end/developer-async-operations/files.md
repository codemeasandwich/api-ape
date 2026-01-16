# Async Operations Test Scenario Files

Tests async controller behavior and parallel API call execution.

## Directory Structure

```
developer-async-operations/
├── parallel-slow-calls-complete-independently.js
└── user-waits-for-slow-api-response.js
```

## Files

### parallel-slow-calls-complete-independently.js

Tests that multiple slow API calls execute in parallel and complete within the longest call's duration, not sequentially.

### user-waits-for-slow-api-response.js

Tests that a client properly waits for and receives a slow server response without timeout.
