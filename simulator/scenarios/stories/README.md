# Stories Module

## Overview

The stories module contains complete user journey test suites organized by feature area. Stories compose atomic actions into realistic scenarios that prove api-ape works as documented.

**Key capabilities:**

- **RPC stories** — Test all RPC functionality including nested routes, async, errors
- **Broadcast stories** — Test broadcast messaging between clients
- **Lifecycle stories** — Test connection lifecycle, embed, hooks
- **File sharing stories** — Test binary file transfers
- **Cluster stories** — Test multi-server Forest functionality
- **End-to-end stories** — Comprehensive cross-feature scenarios
- **Chat app stories** — Complete chat application user journeys

Each story directory contains an `index.test.js` that runs all scenarios in that category.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```bash
# Run all stories
npm test -- simulator/scenarios/stories/

# Run specific story category
npm test -- simulator/scenarios/stories/rpc/

# Run single test file
npm test -- simulator/scenarios/stories/rpc/index.test.js
```

## Story Structure

Each story follows a consistent pattern:

```javascript
// stories/feature/scenario-name/test-case.js
module.exports = async function({ harness, expect }) {
  // Setup
  const { server, client } = await harness.createPair();

  // Execute user journey
  const result = await client.call('endpoint', data);

  // Verify
  expect(result).toBe(expected);
};
```

## See Also

- [`../actions/README.md`](../actions/README.md) — Atomic actions used by stories
- [`../../harness/README.md`](../../harness/README.md) — Test infrastructure
