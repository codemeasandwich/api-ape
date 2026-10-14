# Call Contract Stories Files

Stories about the server's side of the call protocol, driven with a raw socket so every frame is visible.

## Guidelines

- **Name tests as user stories** — "two slow calls at once: each keepalive frame carries its own call's id"
- **Assert observable behaviour only** — frames on the wire, replies, startup errors; no internals
- **Red first** — each story was run against the unfixed code and failed before the fix

## Directory Structure

```
call-contract/
├── README.md       # Overview
├── files.md        # This file
├── hostile-peer.test.js   # What a stranger's frames can make a server do
├── index.test.js   # The stories
├── long-poll.test.js   # A call over HTTP (SSE stream + POST) behaves as over a WebSocket
├── raw-client.js   # Raw-socket client that records every frame
└── wire-protocol.test.js  # The documented wire protocol, spoken with api-ape/jss and api-ape/messageHash
```

## Files

### `index.test.js`

The call-contract stories (keepalive, identical calls, replies, errors and what `errCode` / `errData` may carry, controller files, context from `onConnect`, options). Starts a harness server over `simulator/test-api-contract/` or over controller files written to a temp directory for the test, and talks to it with the raw client.

### `hostile-peer.test.js`

Security stories with a raw WebSocket peer against a real server: an error tag naming `Worker`, `WebSocket`, `XMLHttpRequest`, `EventSource`, `Function`, `Proxy` or `__proto__` constructs nothing; a call to an inherited name (`valueOf`, `constructor`, `__proto__`) is not found like any unknown endpoint; a pointer cannot hand a controller `Function` or `Object`; an upload field path through `constructor.prototype` (or through a text value) is refused instead of changing `Object.prototype`.

### `long-poll.test.js`

The HTTP long-poll path spoken with plain `fetch`: the reply frame (with `undefined` tagged), a 500 carrying the Error with its code and data and no stack, an unserialisable thrown value, 404 for unknown and inherited endpoint names (same message as a WebSocket), 401 without a session, a call with no open stream, `this.keepalive()` / `this.broadcast` / `this.send` (including an error push) arriving on the open stream, and an embed that names `clientId` / `sessionId`.

### `wire-protocol.test.js`

Conformance of every frame in the "Wire protocol" section of `server/README.md`, from an outside program's point of view: it imports `api-ape/jss` and `api-ape/messageHash` by their published names and talks to a real server over a raw WebSocket (`__connected__`, call and reply, `data<!U>`, keepalive, error frames with code/data, subscribe, push, unsubscribe, last-message replay). Fails if either helper is not exported.

### `raw-client.js`

`connectRaw(server)` opens a plain WebSocket, sends `{type, data, createdAt}` frames with `queryId = messageHash(message)`, and records every frame the server sends (including keepalive and error frames the real clients hide).
