# JSS Actions Module

## Overview

The JSS actions module provides atomic operations for testing api-ape's JSS (JavaScript Serialization) type support. JSS extends JSON to preserve JavaScript types like Date, RegExp, Error, Set, Map, and undefined.

**Key capabilities:**

- **Type round-trips** — Verify types survive serialization/deserialization
- **Complex structures** — Test nested objects with multiple types
- **Edge cases** — Test type-specific edge cases (empty Set, RegExp flags, etc.)
- **Assertion helpers** — Deep equality and type checking utilities

These operations ensure data integrity through the WebSocket message pipeline.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```javascript
const jss = require('../actions/jss');

// Test Date round-trip
await jss.testDate({ client, date: new Date('2024-01-01') });

// Test all types at once
await jss.testAllTypes({ client, endpoint: 'types' });

// Custom round-trip test
await jss.roundTrip({
  client,
  endpoint: 'echo',
  data: { pattern: /test/gi, items: new Set([1, 2, 3]) }
});
```

## See Also

- [`../README.md`](../README.md) — Actions overview
- [`../../stories/rpc/README.md`](../../stories/rpc/README.md) — RPC stories including JSS tests
- [`../../../../utils/jss/README.md`](../../../../utils/jss/README.md) — JSS implementation
