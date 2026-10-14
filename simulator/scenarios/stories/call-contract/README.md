# Call Contract Stories

## Overview

What a caller can rely on when it makes a call, as a raw-socket user sees it: keepalive frames, replies, errors. Each test is a user story and goes through the public server API (`ape()` via the harness) and a raw WebSocket, never through internals.

The page-side halves of these stories (the real browser client) are in `integration/bun/client-*.ts` and run under Bun.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```bash
npm test -- simulator/scenarios/stories/call-contract/
```

## See Also

- [`../README.md`](../README.md) — Stories overview
- [`../../../test-api-contract/README.md`](../../../test-api-contract/README.md) — controllers these stories call
