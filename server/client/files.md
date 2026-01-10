# Server Client Module Files

This module enables api-ape servers to act as WebSocket clients, connecting outbound to other api-ape servers or WebSocket endpoints. Essential for server-to-server communication in distributed architectures.

## Guidelines

- **Mirror browser client API** — The proxy-based API (`api.users.list()`) must behave identically to the browser client
- **JSS encoding** — Use `utils/jss` for message serialization to preserve Date, Set, Map, etc.
- **Auto-reconnection** — Always implement exponential backoff on connection failures
- **Message queuing** — Buffer messages during disconnection; deliver when reconnected
- **QueryId correlation** — All requests must track `queryId` for proper response matching

## Directory Structure

```
client/
└── connection.js   # Client connection management
```

## Files

### `connection.js`

Manages outbound WebSocket connections from the server:

- **Connection lifecycle** — Connect, disconnect, and reconnect handling
- **Exponential backoff** — Automatic reconnection with increasing delays
- **Message queuing** — Queues messages during disconnection periods
- **JSS encoding/decoding** — Full support for extended types (Date, Set, Map, etc.)
- **Request/response correlation** — Tracks pending requests via `queryId`
- **Event emission** — Emits `message`, `open`, `close`, and `error` events