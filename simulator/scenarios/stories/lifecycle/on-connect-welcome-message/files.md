# On Connect Welcome Message Test Scenario Files

Tests verifying that servers can send welcome messages to clients during the connection handshake.

## Directory Structure

```
on-connect-welcome-message/
├── multiple-welcome-messages-can-be-sent.js
└── server-can-send-welcome-message-on-connect.js
```

## Files

### `multiple-welcome-messages-can-be-sent.js`

Tests that the `onConnect` handler can send multiple different messages to a newly connected client.

### `server-can-send-welcome-message-on-connect.js`

Tests that the server can send a welcome message using the `send` function provided in the `onConnect` callback.
