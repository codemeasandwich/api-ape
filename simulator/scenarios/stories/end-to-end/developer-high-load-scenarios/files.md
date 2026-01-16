# High Load Scenarios Test Scenario Files

Tests system behavior under high load.

## Directory Structure

```
developer-high-load-scenarios/
├── chat-room-with-many-simultaneous-users.js
├── rapid-message-sending-between-users.js
└── user-makes-many-api-calls-simultaneously.js
```

## Files

### chat-room-with-many-simultaneous-users.js

Tests a chat room with 10 simultaneous users where broadcast messages reach all recipients except the sender.

### rapid-message-sending-between-users.js

Tests that 20 messages sent in rapid succession are all delivered to the receiver.

### user-makes-many-api-calls-simultaneously.js

Tests that 20 concurrent API calls all succeed and return correct data.
