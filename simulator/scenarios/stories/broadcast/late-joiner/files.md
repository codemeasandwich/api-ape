# Late Joiner Test Scenario Files

Tests verifying that clients connecting after broadcasts have been sent do not receive old messages.

## Directory Structure

```
late-joiner/
└── late-joiner-does-not-receive-old-broadcasts.js
```

## Files

### `late-joiner-does-not-receive-old-broadcasts.js`

Tests that a client joining after messages have been broadcast only receives messages sent after their connection, not historical messages.
