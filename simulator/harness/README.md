# Test Harness Module

## Overview

The harness module provides the core infrastructure for end-to-end testing of api-ape. It orchestrates server instances, simulated browser clients, and fake database adapters to enable comprehensive testing without external dependencies.

**Key capabilities:**

- **Server management** — Spawn api-ape servers with automatic port allocation and lifecycle management
- **Client simulation** — Create WebSocket clients that communicate with real servers using the api-ape protocol
- **Browser emulation** — Provide browser globals (window, document, navigator) for client code to run in Node.js
- **Database mocking** — In-memory adapter implementing the Forest cluster interface for multi-server testing
- **Test orchestration** — Convenience methods like `createPair()`, `createGroup()`, and `createCluster()` for common setups

The harness enables testing the complete api-ape stack through its public interface only.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

### Basic Setup

```javascript
const { Harness } = require('./harness');

const harness = new Harness();
const { server, client } = await harness.createPair();

const result = await client.call('echo', { message: 'Hello!' });
expect(result.message).toBe('Hello!');

await harness.cleanup();
```

### Multiple Clients

```javascript
const { server, clients } = await harness.createGroup(3);
const [alice, bob, charlie] = clients;

// Alice broadcasts, Bob and Charlie receive
await alice.call('message', { text: 'Hello everyone!' });
const msg = await bob.waitFor('message');
```

### Cluster Testing

```javascript
const servers = await harness.createCluster(3);
const client1 = await harness.createClient({ url: servers[0].url });
const client2 = await harness.createClient({ url: servers[1].url });

// Cross-server broadcast works via fake database
```

## See Also

- [`../README.md`](../README.md) — Simulator overview and test architecture
- [`../scenarios/README.md`](../scenarios/README.md) — Test scenarios using this harness
