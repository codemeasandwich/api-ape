# Edge Cases Actions Module

## Overview

The edge cases actions module provides atomic operations for testing error conditions, boundary conditions, and unusual scenarios in api-ape. These actions help achieve full code coverage by exercising error paths.

**Key capabilities:**

- **Error scenarios** — Test missing endpoints, disconnected clients, timeouts
- **Payload limits** — Test large payloads, empty payloads, special characters
- **Stress testing** — Rapid calls, many clients, rapid connect/disconnect
- **Timing issues** — Disconnect during call, timeout handling

These operations are essential for testing defensive code paths.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```javascript
const edge = require('../actions/edge-cases');

// Test missing endpoint
await edge.callMissingEndpoint({ client, endpoint: 'nonexistent' });

// Test large payload
await edge.callWithLargePayload({ client, endpoint: 'echo', sizeKB: 500 });

// Stress test with rapid calls
await edge.rapidCalls({ client, endpoint: 'echo', count: 100 });
```

## See Also

- [`../README.md`](../README.md) — Actions overview
- [`../../stories/end-to-end/README.md`](../../stories/end-to-end/README.md) — End-to-end stories including edge cases
