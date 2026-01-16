# Wait For Buffering Test Scenario Files

Tests verifying client message buffering and `waitFor()` functionality.

## Directory Structure

```
wait-for-buffering/
├── wait-for-returns-existing-buffered-message.js
├── wait-for-times-out-when-no-message.js
└── wait-for-waits-for-future-message.js
```

## Files

### `wait-for-returns-existing-buffered-message.js`

Tests that `waitFor()` immediately returns a message that was already received and buffered before the wait call.

### `wait-for-times-out-when-no-message.js`

Tests that `waitFor()` throws a timeout error when no matching message arrives within the specified timeout period.

### `wait-for-waits-for-future-message.js`

Tests that `waitFor()` correctly waits and resolves when a message arrives after the wait call has been initiated.
