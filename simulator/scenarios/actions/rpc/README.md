# RPC Actions Module

## Overview

The RPC actions module provides atomic operations for testing api-ape's Remote Procedure Call functionality. These actions cover making API calls, handling responses, and error scenarios.

**Key capabilities:**

- **Simple calls** — Make single API calls and receive responses
- **Nested routes** — Call deeply nested endpoints (e.g., `users/profile`)
- **Concurrent calls** — Make multiple simultaneous calls
- **Error handling** — Test error responses and timeouts
- **Performance** — Measure call timing

RPC is the core of api-ape's functionality, making these actions fundamental to testing.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```javascript
const rpc = require('../actions/rpc');

// Simple call
const result = await rpc.call({ client, endpoint: 'echo', data: { msg: 'hi' } });

// Nested route
const profile = await rpc.callNested({ client, path: 'users/profile', data: { id: 1 } });

// Expect error
await rpc.callAndExpectError({ client, endpoint: 'errors', errorContains: 'failed' });

// Concurrent calls
const results = await rpc.callConcurrent({
  client,
  calls: [
    { endpoint: 'echo', data: { n: 1 } },
    { endpoint: 'echo', data: { n: 2 } }
  ]
});
```

## See Also

- [`../README.md`](../README.md) — Actions overview
- [`../../stories/rpc/README.md`](../../stories/rpc/README.md) — RPC user stories
