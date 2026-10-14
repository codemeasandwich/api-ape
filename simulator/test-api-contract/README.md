# Contract Test Controllers

## Overview

Controllers for the call-contract stories (`simulator/scenarios/stories/call-contract/`). Each controller exists to make one promise of the call protocol observable on the wire: keepalive frames, replies for calls that return nothing, structured errors, controllers written as `export default`.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```javascript
const server = await harness.createServer({ where: path.resolve(__dirname, '../../../test-api-contract') });
```

## See Also

- [`../scenarios/stories/call-contract/README.md`](../scenarios/stories/call-contract/README.md) — the stories that use these controllers
- [`../test-api/README.md`](../test-api/README.md) — the general-purpose test controllers
