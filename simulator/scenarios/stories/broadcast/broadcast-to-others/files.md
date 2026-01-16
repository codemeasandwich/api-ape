# Broadcast To Others Test Scenario Files

Tests verifying that `broadcastOthers()` correctly excludes the sender from receiving their own broadcast messages.

## Directory Structure

```
broadcast-to-others/
├── sender-does-not-receive-own-broadcast.js
└── multiple-senders-excluded-from-own-messages.js
```

## Files

### `sender-does-not-receive-own-broadcast.js`

Tests that when a client sends a broadcast message, they do not receive it themselves while other clients do receive it.

### `multiple-senders-excluded-from-own-messages.js`

Tests that when multiple clients each send broadcast messages, each sender is excluded from their own message but receives messages from all other senders.
