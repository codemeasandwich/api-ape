# Complete User Journey Test Scenario Files

Tests simulating complete chat application workflows with multiple users.

## Directory Structure

```
complete-user-journey/
├── full-chat-session-with-multiple-users.js
├── many-users-in-a-chat-room.js
└── rapid-message-exchange-between-two-users.js
```

## Files

### `full-chat-session-with-multiple-users.js`

Tests a complete chat session lifecycle: Alice joins, Bob joins, they exchange messages, Charlie joins late (missing earlier messages), Bob disconnects, and messaging continues between remaining users.

### `many-users-in-a-chat-room.js`

Tests a chat room with 8 users where each user sends a message, verifying each user receives messages from all other users (but not their own).

### `rapid-message-exchange-between-two-users.js`

Tests rapid back-and-forth messaging between two users, verifying each user only receives the other's messages and message integrity is maintained.
