# 🦍 API-APE End-to-End Testing Scenarios

## Philosophy

This testing system achieves **100% code coverage** through **real-world user stories** executed entirely through api-ape's **public developer interface**. No internal imports, no mocking internals—just the same API developers use.

### Core Principles

1. **Public Interface Only** — All tests use `ape()`, `api.*`, `broadcast()`, `clients`, and controller `this.*` context
2. **User Stories Over Unit Tests** — Tests simulate real user journeys, not isolated function calls
3. **Modular Actions** — Atomic, composable actions that build into complete scenarios
4. **Instant Execution** — Everything runs in-process with zero network delay
5. **Dead Code Detection** — Uncovered code = unused code = deletable code

### Benefits

- **Real-world validation** — Tests prove the framework works as documented
- **Refactor-friendly** — No brittle unit tests to maintain; change internals freely
- **Coverage = Completeness** — 100% coverage means every feature has a user story
- **Living documentation** — Scenarios serve as executable examples

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER STORIES                                │
│  (Complete journeys: Chat App, File Sharing, Dashboard, etc.)       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ composed of
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           ACTIONS                                   │
│  Atomic, reusable test operations:                                  │
│  • connection.connect()     • rpc.call()        • files.upload()    │
│  • connection.disconnect()  • rpc.callNested()  • files.download()  │
│  • broadcast.toAll()        • lifecycle.embed() • cluster.join()    │
│  • broadcast.toOthers()     • lifecycle.hooks() • cluster.route()   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ operates on
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          HARNESS                                    │
│  Test infrastructure:                                               │
│  • ServerManager    — Spawns api-ape servers                        │
│  • ClientManager    — Creates WebSocket clients                     │
│  • FakeDatabase     — In-memory cluster backend                     │
│  • FakeBrowser      — Browser globals for client code               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ uses only
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PUBLIC API (api-ape)                            │
│  Server: ape(), broadcast(), clients, ape.joinVia()                 │
│  Client: api.*, api.on(), api.onConnectionChange()                  │
│  Controller: this.broadcast(), this.broadcastOthers(), this.clientId│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
simulator/
├── scenarios/
│   ├── README.md              # This file
│   ├── runner.js              # Scenario runner with coverage tracking
│   │
│   ├── actions/               # Atomic, composable test actions
│   │   ├── index.js           # Action registry
│   │   ├── connection.js      # Connect, disconnect, reconnect, transport
│   │   ├── rpc.js             # Call endpoints, handle responses, errors
│   │   ├── broadcast.js       # Broadcast all, others, specific clients
│   │   ├── lifecycle.js       # onConnect, embed, disconnect hooks
│   │   ├── files.js           # Upload, download, streaming transfers
│   │   ├── cluster.js         # Forest join, route, cross-server messages
│   │   ├── jss.js             # Date, RegExp, Error, Set, Map round-trips
│   │   └── edge-cases.js      # Timeouts, errors, concurrent requests
│   │
│   └── stories/               # Complete user journey tests
│       ├── index.js           # Story registry
│       ├── chat-app.test.js   # Real-time chat scenarios
│       ├── file-sharing.test.js
│       ├── dashboard.test.js  # High-frequency updates
│       ├── auth-flow.test.js  # Connection with embed/session
│       └── cluster.test.js    # Multi-server scenarios
│
├── controllers/               # Test API endpoints
│   ├── echo.js                # Basic RPC
│   ├── message.js             # Broadcasting
│   ├── users/
│   │   ├── index.js           # User list
│   │   └── profile.js         # Nested routes
│   ├── files/
│   │   ├── upload.js          # Binary upload
│   │   └── download.js        # Binary download
│   ├── types.js               # JSS type round-trips
│   ├── delay.js               # Async controller
│   └── errors.js              # Error scenarios
│
├── harness/                   # Test infrastructure (existing)
│   ├── index.js
│   ├── server-manager.js
│   ├── client-manager.js
│   ├── fake-browser.js
│   └── fake-db.js
│
└── coverage/                  # Coverage reports
    └── summary.json           # Coverage by user story
```

---

## Actions API

Actions are atomic test operations that can be composed into stories.

### Connection Actions

```js
const { connection } = require('../actions')

// Connect a client to a server
const client = await connection.connect({ server })

// Disconnect cleanly
await connection.disconnect({ client })

// Force disconnect (simulate network failure)
await connection.forceClose({ client })

// Reconnect after disconnect
await connection.reconnect({ client })

// Switch transport mid-session
await connection.switchTransport({ client, transport: 'polling' })

// Verify connection state
await connection.assertState({ client, state: 'connected' })
```

### RPC Actions

```js
const { rpc } = require('../actions')

// Simple call
const result = await rpc.call({ client, endpoint: 'echo', data: { msg: 'hi' } })

// Nested route call
const profile = await rpc.call({ client, endpoint: 'users/profile', data: { id: 1 } })

// Expect error
await rpc.expectError({ client, endpoint: 'unknown', errorContains: 'not found' })

// Concurrent calls
const results = await rpc.callMany({ client, calls: [
  { endpoint: 'echo', data: { n: 1 } },
  { endpoint: 'echo', data: { n: 2 } },
] })

// Call with timeout
await rpc.callWithTimeout({ client, endpoint: 'delay', timeout: 100 })
```

### Broadcast Actions

```js
const { broadcast } = require('../actions')

// Broadcast to all (from server)
await broadcast.toAll({ server, type: 'announcement', data: { msg: 'hi' } })

// Broadcast to others (from controller)
await broadcast.toOthers({ sender, type: 'chat', data: { text: 'hello' } })

// Verify client received broadcast
await broadcast.expectReceived({ client, type: 'chat', timeout: 100 })

// Verify client did NOT receive
await broadcast.expectNotReceived({ client, type: 'chat', timeout: 50 })
```

### Lifecycle Actions

```js
const { lifecycle } = require('../actions')

// Create server with embed
const server = await lifecycle.createServerWithEmbed({
  embed: { userId: '123', role: 'admin' }
})

// Verify embed accessible in controller
await lifecycle.verifyEmbed({ client, endpoint: 'profile', embedKey: 'userId' })

// Track lifecycle events
const events = await lifecycle.trackEvents({ server, client })
// events = { connected: true, disconnected: false, ... }

// Verify onDisconnect fired
await lifecycle.verifyDisconnect({ events, client })
```

### File Actions

```js
const { files } = require('../actions')

// Upload binary
const result = await files.upload({ 
  client, 
  endpoint: 'files/upload',
  filename: 'test.png',
  data: Buffer.from([0x89, 0x50, 0x4E, 0x47]) 
})

// Download binary
const downloaded = await files.download({
  client,
  endpoint: 'files/download',
  filename: 'test.png'
})

// Client-to-client file share
await files.share({ sender, receiver, data: Buffer.from('shared') })
```

### Cluster Actions

```js
const { cluster } = require('../actions')

// Create multi-server cluster
const { servers, fakeDb } = await cluster.create({ count: 3 })

// Connect client to specific server
const client1 = await cluster.connectTo({ server: servers[0] })
const client2 = await cluster.connectTo({ server: servers[1] })

// Verify cross-server message delivery
await cluster.verifyCrossServerMessage({
  sender: client1,
  receiver: client2,
  type: 'chat',
  data: { text: 'hello' }
})

// Verify broadcast reaches all servers
await cluster.verifyBroadcast({ servers, clients: [client1, client2] })
```

### JSS Type Actions

```js
const { jss } = require('../actions')

// Round-trip complex types
await jss.roundTrip({ client, endpoint: 'types', data: {
  date: new Date('2024-01-01'),
  regex: /test/gi,
  error: new Error('test error'),
  set: new Set([1, 2, 3]),
  map: new Map([['a', 1], ['b', 2]]),
  undef: undefined
}})
```

### Edge Case Actions

```js
const { edge } = require('../actions')

// Request timeout
await edge.timeout({ client, endpoint: 'delay', timeout: 50 })

// Large payload
await edge.largePayload({ client, endpoint: 'echo', sizeKB: 500 })

// Rapid fire requests
await edge.rapidRequests({ client, endpoint: 'echo', count: 100 })

// Reconnect during request
await edge.reconnectMidRequest({ client, endpoint: 'delay' })
```

---

## User Stories

Stories compose actions into complete user journeys.

### Example: Chat Application

```js
// stories/chat-app.test.js
const { connection, rpc, broadcast, lifecycle } = require('../actions')

describe('Chat Application', () => {
  it('complete user journey', async () => {
    // 1. Server setup with user tracking
    const server = await lifecycle.createServerWithEmbed({
      embed: (req) => ({ userId: extractUserId(req) })
    })
    
    // 2. Alice joins
    const alice = await connection.connect({ server, cookies: { userId: 'alice' } })
    
    // 3. Bob joins, receives welcome
    const bob = await connection.connect({ server, cookies: { userId: 'bob' } })
    const welcome = await broadcast.expectReceived({ client: bob, type: 'welcome' })
    
    // 4. Alice sends message, Bob receives
    await rpc.call({ client: alice, endpoint: 'message', data: { text: 'Hello!' } })
    const msg = await broadcast.expectReceived({ client: bob, type: 'message' })
    expect(msg.data.text).toBe('Hello!')
    
    // 5. Alice doesn't receive her own message
    await broadcast.expectNotReceived({ client: alice, type: 'message' })
    
    // 6. Alice uploads file, Bob downloads
    const uploaded = await files.upload({ client: alice, ... })
    const downloaded = await files.download({ client: bob, ... })
    
    // 7. Alice disconnects, Bob notified
    await connection.disconnect({ client: alice })
    await broadcast.expectReceived({ client: bob, type: 'user-left' })
    
    // Cleanup
    await connection.disconnect({ client: bob })
    await server.close()
  })
})
```

---

## Coverage Tracking

The runner tracks which code paths are exercised by each user story.

```js
// runner.js
const { runWithCoverage } = require('./runner')

const results = await runWithCoverage([
  'stories/chat-app.test.js',
  'stories/file-sharing.test.js',
  'stories/cluster.test.js'
])

console.log(results.coverage)
// {
//   'server/lib/main.js': { lines: 95.2, branches: 88.1 },
//   'server/lib/wiring.js': { lines: 100, branches: 97.3 },
//   'client/connectSocket.js': { lines: 92.1, branches: 85.4 },
//   ...
// }

console.log(results.uncovered)
// [
//   { file: 'server/lib/bun.js', reason: 'Bun runtime only' },
//   { file: 'server/adapters/firebase.js', reason: 'No Firebase story yet' }
// ]
```

---

## Running Tests

```bash
# Run all scenarios
npm test -- simulator/scenarios

# Run specific story
npm test -- simulator/scenarios/stories/chat-app.test.js

# Run with coverage
npm run test:cover -- simulator/scenarios

# Generate coverage report
npm run coverage:report
```

---

## Adding New Scenarios

### 1. Create Controllers (if needed)

```js
// controllers/my-feature.js
module.exports = function(data) {
  // Use this.broadcast, this.broadcastOthers, this.clientId, etc.
  return { result: 'ok' }
}
```

### 2. Create Actions (if needed)

```js
// actions/my-feature.js
async function myAction({ client, ...options }) {
  // Compose existing actions or create new ones
  const result = await client.call('my-feature', options)
  return result
}

module.exports = { myAction }
```

### 3. Create User Story

```js
// stories/my-feature.test.js
const { connection, rpc } = require('../actions')
const { myAction } = require('../actions/my-feature')

describe('My Feature', () => {
  it('user can do the thing', async () => {
    const { server, client } = await harness.createPair()
    
    // Execute user journey using actions
    await myAction({ client, ... })
    
    await harness.cleanup()
  })
})
```

---

## Coverage Goals

| Module | Target | Current | Notes |
|--------|--------|---------|-------|
| `server/lib/main.js` | 100% | - | Core server initialization |
| `server/lib/wiring.js` | 100% | - | WebSocket handling |
| `server/lib/broadcast.js` | 100% | - | Client tracking, broadcasts |
| `server/lib/loader.js` | 100% | - | Controller loading |
| `server/lib/longPolling.js` | 100% | - | HTTP fallback |
| `server/lib/fileTransfer.js` | 100% | - | Binary data handling |
| `server/socket/receive.js` | 100% | - | Message processing |
| `server/socket/send.js` | 100% | - | Response sending |
| `client/connectSocket.js` | 100% | - | Client connection |
| `client/connection/*.js` | 100% | - | State, proxy, sender |
| `client/transports/*.js` | 100% | - | Streaming fallback |
| `utils/jss.js` | 100% | - | Serialization |
| `server/adapters/*.js` | 100% | - | Cluster backends |

**Dead Code Policy**: Any code not covered after all scenarios pass is dead code and should be removed or documented as runtime-specific (Bun, Deno).