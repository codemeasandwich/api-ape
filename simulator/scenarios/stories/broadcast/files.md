# Broadcast Stories Module Files

This module contains test suites for api-ape's broadcast messaging functionality. These tests verify that server-pushed messages reach the correct clients.

## Guidelines

- **Multiple clients** — Most broadcast tests need 2+ clients to verify message routing
- **Sender exclusion** — Always verify sender doesn't receive their own `broadcastOthers` messages
- **Clear buffers** — Clear message buffers between test phases

## Directory Structure

```
broadcast/
├── index.test.js              # Main test file that imports all scenarios
├── broadcast-to-others/       # Tests for broadcastOthers() functionality
├── late-joiner/               # Tests for clients joining after broadcasts
├── multiple-clients-scaling/  # Tests for broadcasts to many clients
└── wait-for-buffering/        # Tests for message buffering behavior
```

## Directories

### `broadcast-to-others/`

Tests verifying that `broadcastOthers()` sends to all clients except the sender.

### `late-joiner/`

Tests verifying that clients connecting after a broadcast don't receive old messages.

### `multiple-clients-scaling/`

Tests verifying broadcasts work correctly with many simultaneous clients.

### `wait-for-buffering/`

Tests verifying client message buffering and `waitFor()` functionality.
