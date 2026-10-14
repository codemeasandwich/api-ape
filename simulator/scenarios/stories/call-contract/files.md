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
├── index.test.js   # The stories
└── raw-client.js   # Raw-socket client that records every frame
```

## Files

### `index.test.js`

The call-contract stories. Starts a harness server over `simulator/test-api-contract/` and talks to it with the raw client.

### `raw-client.js`

`connectRaw(server)` opens a plain WebSocket, sends `{type, data, createdAt}` frames with `queryId = messageHash(message)`, and records every frame the server sends (including keepalive and error frames the real clients hide).
