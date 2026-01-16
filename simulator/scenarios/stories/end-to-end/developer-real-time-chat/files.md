# Real-Time Chat Test Scenario Files

Tests real-time messaging between users.

## Directory Structure

```
developer-real-time-chat/
├── late-joiner-misses-previous-messages.js
└── two-users-exchange-messages-in-real-time.js
```

## Files

### late-joiner-misses-previous-messages.js

Tests that a user who joins late does not receive messages sent before they connected.

### two-users-exchange-messages-in-real-time.js

Tests a complete chat conversation: Alice sends to Bob, Bob receives (Alice doesn't get her own), Bob replies, Alice receives.
