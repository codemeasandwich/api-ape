# Connection Module Files

This module handles the core mechanics of maintaining a WebSocket connection to an api-ape server. It manages connection state, message sending, request/response correlation, and binary file transfers.

## Guidelines

- **Browser-safe only** — All code must run in browsers without Node.js APIs
- **State consistency** — Connection state changes must flow through `state.js`
- **QueryId correlation** — All requests must use `sender.js` for proper response matching
- **Binary handling** — File transfers use the tag system (`<!B>`, `<!A>`, `<!L>`) — coordinate with `fileHandling.js`
- **Network detection** — Changes to connectivity detection should account for captive portals

## Directory Structure

```
connection/
├── connectAttempt.js  # One connection attempt at a time (no N+1 sockets)
├── fileDownload.js    # Binary file download handling
├── fileHandling.js    # File upload/download coordination
├── fileUtils.js       # File transfer utilities
├── messageHandler.js  # Message processing and dispatch
├── network.js         # Network state detection & WebSocket URL (`getSocketUrl` / resume query)
├── reconnectBackoff.js # Phase 1: reconnect delay math shared policy with Node client
├── proxy.js           # Proxy-based API generation
├── sender.js          # Message sending with queryId correlation
├── state.js           # Connection state machine
├── streamingFallback.js # HTTP streaming fallback + WebSocket-upgrade retry
└── subscriptions.js   # Pub/sub subscription manager
```

## Files

### `connectAttempt.js`

`createConnectAttempt()` returns the guard `connectSocket.js` uses so only one connection attempt (ping, then socket open) runs at a time. Every queued call asks the client to connect; without the guard, N calls made before the first connect opened N+1 sockets. The flag expires after 15 s so a stuck attempt cannot block connecting forever, except while a WebSocket handshake is still pending (expiring then would let a second attempt open a second socket).

### `streamingFallback.js`

`createStreamingFallback(deps)` owns the HTTP streaming transport and the periodic WebSocket-upgrade retry, extracted from `connectSocket.js`. `switchToStreaming()` starts the fallback; the shared connection state is reached through the accessors it is given. A `_keepalive` frame arriving on the stream is dropped (it is not a message for the page). Calls made once the fallback is connected go to the streaming transport's POST (`connectSocket.js` picks the sender by `currentTransport`); before 4.4.0 they were handed to the WebSocket sender and failed with `getSocket().send is not a function`.

### `proxy.js`

Creates the Proxy-based API that allows `api.users.list()` syntax. Intercepts property access and method calls, converting them into WebSocket messages with the appropriate endpoint path.

### `sender.js`

Handles message serialization and request/response correlation. A call that times out, or whose `send` throws, is removed from `waitingOn` (and its timer stopped); a reply that arrives for a call that is gone is dropped, never handed to the page as a push. Generates unique `queryId` for each request, tracks pending requests, manages timeouts, and resolves Promises when responses arrive. A keepalive frame (`this.keepalive()` on the server) restarts the call's timeout and does not settle it. `flushQueue` sends the calls queued while disconnected, emptying the queue in place. `createWsSend` takes a `getClockOffset` and stamps each call's `createdAt` in the server's clock (`new Date(createdAt + offset)`); its own timeout stays on the page's clock.

### `state.js`

Connection state machine that tracks the current connection status. Emits state change events and provides the `onConnectionChange` callback functionality.

**States:** `offline` → `connecting` → `connected` → `disconnected` → `walled`

### `reconnectBackoff.js`

Pure helpers implementing the same exponential cap (**30s**) and jitter (**up to 20%**, added on top of the cap, so at most 36 s) as **`server/client/connection-reconnect.js`** so browser reconnect storms match Node timing. `pingRetryDelayMs` is the same curve starting at 0.5 s, used between reachability pings while the server is unreachable.

### `network.js`

Detects network conditions to provide accurate connection state:
- **Offline** — Browser reports no network (`navigator.onLine`)
- **Walled garden** — Captive portal detected: an HTTP answer that is not the ape ping (WiFi login page), or a redirect (the ping is fetched with `redirect: "manual"`, so a cross-origin redirect is seen as one instead of as a thrown CORS failure that reads as a dead server)
- **Unreachable** — No answer at all (refused, reset, timeout, 5xx gateway): the server is down or restarting; the client reports `disconnected` and retries with backoff (`pingRetryDelayMs`, 0.5 s to a 30 s cap plus up to 20 % jitter)
- **Online** — Full internet connectivity confirmed

`scheduleNetworkRetry` / `cancelNetworkRetry` / `isNetworkRetryPending` own the one scheduled ping retry: a connection attempt starting and a socket opening both cancel it, and while it is pending a call only queues (no ping of its own), so calls during an outage cannot bypass the backoff or open a second socket. The ping's 3 s abort covers reading the body as well, so a server that answers headers and stalls is `unreachable`, not a hang.

Also builds the WebSocket URL (**`getSocketUrl(resumeClientId)`**) including optional **`?resume=`** for Phase 1.

### `fileDownload.js`

Handles downloading binary data from the server. When a response contains `<!L>` (link) tags, fetches the binary data via HTTP GET with session cookies for authentication.

### `fileHandling.js`

Coordinates file uploads and downloads by detecting special tags in messages:
- `<!B>` / `<!A>` — Binary data that needs to be uploaded
- `<!L>` — Download links that need to be fetched

### `fileUtils.js`

Shared utilities for file transfer operations including content type detection, hash generation, and ArrayBuffer/Buffer conversions.

### `messageHandler.js`

Handles incoming message processing and dispatch. Processes binary data hydration (fetching linked resources) and dispatches messages to registered handlers and subscription callbacks. Provides the `setOnReceiver` function for registering message handlers.

### `subscriptions.js`

Manages channel subscriptions for the chained subscription syntax. Tracks local callbacks per channel, sends subscribe/unsubscribe messages to server, dispatches incoming data to callbacks, and handles resubscription on reconnect. A subscription may carry an `onError`; when the server refuses it (`__subscribe_refused__`, from the server's `onSubscribe`) `refuse(err)` calls each subscriber's `onError` once and drops the channel.