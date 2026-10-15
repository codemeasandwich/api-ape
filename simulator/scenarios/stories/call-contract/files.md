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
├── clock-skew.test.js           # `maxClockSkewMs`, `serverTime` in `__connected__`, clients stamping in the server's clock
├── controllers-option.test.js   # `controllers` map instead of a folder: same naming rules, refusals, `this`
├── hostile-peer.test.js   # What a stranger's frames can make a server do
├── index.test.js   # The stories
├── long-poll.test.js   # A call over HTTP (SSE stream + POST) behaves as over a WebSocket
├── raw-client.js   # Raw-socket client that records every frame
├── subscribe-authorisation.test.js   # `onSubscribe`, the refusal frame, `clearLastMessage`
└── wire-protocol.test.js  # The documented wire protocol, spoken with api-ape/jss and api-ape/messageHash
```

## Files

### `index.test.js`

The call-contract stories (keepalive, identical calls, replies, errors and what `errCode` / `errData` may carry, controller files, context from `onConnect`, options). Starts a harness server over `simulator/test-api-contract/` or over controller files written to a temp directory for the test, and talks to it with the raw client.

### `clock-skew.test.js`

Clock skew (4.5.1). A raw socket against a real server: a call stamped 1 ms to 4 s ahead is answered, one 8 s ahead is refused with an error frame (no data) naming the amount and `maxClockSkewMs`, and its controller never runs; `maxClockSkewMs` (30 s, 0, and start-up refusal of -1, a string, `NaN`, `Infinity`, `null`); the 10 s staleness window and the replay check are unchanged; `__connected__` (WebSocket and long-poll stream) carries `serverTime`. The real server-side client against a stand-in server: calls (including ones queued while connecting, in order) are stamped in a server clock that is a minute ahead or an hour behind; an older server with no `serverTime` (or a non-number) keeps the client's own clock; a server that never greets does not stall a queued call; a reconnect recomputes the offset; a refusal frame rejects the caller's promise with the server's message, also end to end through a proxy that lies about the time. Run against 4.5.0 the stories about the tolerance, `serverTime` and the stamping fail; the ones that pin behaviour that did not change (the 10 s window, a refusal rejecting the caller) pass.

### `controllers-option.test.js`

The `controllers` option (4.5.0), through `ape()` and a raw socket: a nested endpoint, an `export default` module namespace, a leading slash, `users/index`, `this` (embed, `clientId`, `broadcast`, `publish`), names every object inherits, the map copied at start, the `api` URL prefix and `urlPrefix`; start-up refusals (both or neither of `where` / `controllers`, a non-function value, `_private` / bare `index` / `.test` / empty-segment keys, duplicate endpoints); `watch` and `selector` ignored with a warning.

### `subscribe-authorisation.test.js`

`onSubscribe` (4.5.0) through raw sockets and the real server-side client: nothing changes without it; a refused client gets the `__subscribe_refused__` frame and neither the retained message nor later publishes; per-user rules from `embed`; asked again per connection; an asynchronous guard (unsubscribe, a newer subscribe or a disconnect while pending leave nothing behind, proven with a resumed client); fail closed (throw, rejection, undefined, truthy non-boolean, non-string channel) without leaking the cause; `api.channel(callback, onError)` on the server-side client; a refusal in flight when the client left and asked again (unsubscribe sent so both agree); asking again after a refusal is delivered once; a throwing log sink never escapes; a client on the HTTP long-poll path cannot subscribe; `clearLastMessage` (function, `ape.`, `this.`).

### `hostile-peer.test.js`

Security stories with a raw WebSocket peer against a real server: an error tag naming `Worker`, `WebSocket`, `XMLHttpRequest`, `EventSource`, `Function`, `Proxy` or `__proto__` constructs nothing; a call to an inherited name (`valueOf`, `constructor`, `__proto__`) is not found like any unknown endpoint; a pointer cannot hand a controller `Function` or `Object`; an upload field path through `constructor.prototype` (or through a text value) is refused instead of changing `Object.prototype`; a pointer under a duplicate key cannot land on a prototype; an inline binary tag cannot allocate; stacks carry no server path; `throw 0` / `""` / `null` are error replies; messages over `maxMessageBytes` (a single frame, fragments that add up, 100,000 one-byte fragments, a 64-bit length) close the socket with 1009 and leave other clients responsive; an Error a controller returns or pushes arrives with the stack `Name: message`. Also: the server-side client (`api.connect`) throws "needs Node 22 or newer (a global WebSocket)" when the runtime has no global WebSocket.

### `long-poll.test.js`

The HTTP long-poll path spoken with plain `fetch`: the reply frame (with `undefined` tagged), a 500 carrying the Error with its code and data and no stack, an unserialisable thrown value, 404 for unknown and inherited endpoint names (same message as a WebSocket), 401 without a session, a call with no open stream, a POST with a pointer to a prototype, a POST over `maxMessageBytes` (413), no server path in a stack, `this.keepalive()` / `this.broadcast` / `this.send` (including an error push) arriving on the open stream, an embed that names `clientId` / `sessionId`, and the session read from `x-ape-session-id` or a URL-encoded cookie.

### `wire-protocol.test.js`

Conformance of every frame in the "Wire protocol" section of `server/README.md`, from an outside program's point of view: it imports `api-ape/jss` and `api-ape/messageHash` by their published names and talks to a real server over a raw WebSocket (`__connected__`, call and reply, `data<!U>`, keepalive, error frames with code/data, subscribe, push, unsubscribe, last-message replay). Fails if either helper is not exported.

### `raw-client.js`

`connectRaw(server)` opens a plain WebSocket, sends `{type, data, createdAt}` frames with `queryId = messageHash(message)`, and records every frame the server sends (including keepalive and error frames the real clients hide).
