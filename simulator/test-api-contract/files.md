# Contract Test Controllers Files

Controllers loaded by the call-contract stories. Kept apart from `test-api/` so the schema and routing stories that count `test-api/` endpoints are not disturbed.

## Guidelines

- **One promise per controller** — name the controller after the behaviour it exposes
- **Stateless** — a story creates a fresh server per test

## Directory Structure

```
test-api-contract/
├── README.md   # Overview
├── files.md    # This file
├── echo.js     # Returns its payload under `echo`
├── voidret.js  # Async controller that returns nothing (the caller must still get a reply)
└── slow.js     # Long-running call that sends this.keepalive() after each round
```

## Files

### `echo.js`

Returns `{ echo: <payload> }`. Used where a story needs to tell replies apart (identical calls in one millisecond).

### `voidret.js`

An async controller that returns `undefined`. Proves the server replies (`data<!U>`) so the caller's promise settles.

### `slow.js`

Works for `n` rounds of `ms` milliseconds and calls `this.keepalive()` after each round, then returns `{ done, tag, rounds }`. Used to prove keepalive frames carry their own call's queryId when two slow calls run at once.
