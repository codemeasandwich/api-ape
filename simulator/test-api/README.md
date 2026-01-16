# Test API Controllers Module

## Overview

The test-api module contains test controllers that api-ape loads during testing. These are minimal implementations designed to exercise specific framework features.

**Key capabilities:**

- **Basic RPC** — Echo controller for request/response testing
- **Broadcasting** — Message controller for broadcast testing
- **Nested routes** — Deep directory structure for routing tests
- **File transfers** — Upload/download controllers for binary testing
- **Error handling** — Controllers that throw various errors
- **Async behavior** — Delay controller for async testing
- **Type handling** — Types controller for JSS testing

Controllers follow api-ape conventions: export a function, use `this.*` for context.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

Controllers in this directory are automatically loaded when the test harness creates a server:

```javascript
const server = await harness.createServer({ where: 'test-api' });
```

The path maps directly to the endpoint:
- `test-api/echo.js` → `client.call('echo', data)`
- `test-api/users/profile.js` → `client.call('users/profile', data)`

## See Also

- [`../harness/README.md`](../harness/README.md) — Test harness that loads these controllers
- [`../../server/README.md`](../../server/README.md) — Server controller documentation
