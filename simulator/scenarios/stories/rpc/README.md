# RPC Stories Module

## Overview

The RPC stories module contains test suites for api-ape's Remote Procedure Call functionality. These tests cover the core request/response mechanism that powers api-ape.

**Key capabilities:**

- **Simple calls** — Basic request/response testing
- **Nested routes** — Deep path routing (`users/profile`)
- **Async controllers** — Controllers that return promises
- **Error handling** — Error responses and propagation
- **JSS types** — Complex type serialization
- **Concurrent calls** — Multiple simultaneous requests

These stories exercise `receive.js`, `send.js`, `loader.js`, and the JSS encoder.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## See Also

- [`../README.md`](../README.md) — Stories overview
- [`../../actions/rpc/README.md`](../../actions/rpc/README.md) — RPC actions
- [`../../actions/jss/README.md`](../../actions/jss/README.md) — JSS actions
