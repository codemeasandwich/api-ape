# Connection Lifecycle Test Scenario Files

Tests the full connection lifecycle including client tracking and context.

## Directory Structure

```
developer-connection-lifecycle/
├── server-accurately-tracks-client-count.js
├── server-passes-user-context-to-controllers.js
└── user-can-reconnect-after-disconnecting.js
```

## Files

### server-accurately-tracks-client-count.js

Tests that the server accurately tracks client count as users connect and disconnect.

### server-passes-user-context-to-controllers.js

Tests that the onConnect hook can embed user context that is available to controllers.

### user-can-reconnect-after-disconnecting.js

Tests that a user can disconnect and reconnect with a new client instance.
