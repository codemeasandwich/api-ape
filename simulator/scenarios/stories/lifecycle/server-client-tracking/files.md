# Server Client Tracking Test Scenario Files

Tests verifying that the server accurately tracks the number of connected clients.

## Directory Structure

```
server-client-tracking/
└── server-tracks-connected-client-count.js
```

## Files

### `server-tracks-connected-client-count.js`

Tests that `server.clientCount` starts at 0, increments as clients connect, and decrements when clients disconnect.
