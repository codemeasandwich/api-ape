# Authentication Handlers Files

This directory contains message handlers that route authentication messages to the appropriate adapter.

## Guidelines

- **Early intercept** — Check `isAuthMessage()` before routing to controllers
- **Return after handling** — Auth messages should not reach controller layer
- **Error responses** — Always send error response on failure, never silently drop

## Directory Structure

```
handlers/
└── auth-messages.js  # Auth message routing
```

## Files

### `auth-messages.js`

Authentication message router:

- `createAuthMessageHandler(socketAuth, send)` — Creates handler bound to socket
- Intercepts auth message types and routes to `socketAuth.handleMessage()`
- Sends responses/errors back via the socket's send function
- `getMessageDescription(type)` — Human-readable auth message descriptions for logging
- `AUTH_MESSAGE_DESCRIPTIONS` — Map of message types to descriptions
