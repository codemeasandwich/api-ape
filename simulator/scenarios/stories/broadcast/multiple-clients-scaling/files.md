# Multiple Clients Scaling Test Scenario Files

Tests verifying that broadcast functionality scales correctly with many simultaneous clients.

## Directory Structure

```
multiple-clients-scaling/
├── broadcast-reaches-all-clients.js
└── rapid-sequential-messages-all-delivered.js
```

## Files

### `broadcast-reaches-all-clients.js`

Tests that a broadcast reaches all 10 connected clients (except the sender) when scaling to multiple connections.

### `rapid-sequential-messages-all-delivered.js`

Tests that when 10 messages are sent in rapid succession, all receivers get every message without drops or ordering issues.
