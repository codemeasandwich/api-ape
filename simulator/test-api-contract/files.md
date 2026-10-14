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
└── slow.js     # Long-running call that sends this.keepalive() after each round
```

## Files

### `slow.js`

Works for `n` rounds of `ms` milliseconds and calls `this.keepalive()` after each round, then returns `{ done, tag, rounds }`. Used to prove keepalive frames carry their own call's queryId when two slow calls run at once.
