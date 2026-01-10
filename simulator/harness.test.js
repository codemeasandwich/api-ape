/**
 * @fileoverview Test Harness Integration Tests
 *
 * These tests verify that all harness components work together correctly:
 * - FakeBrowser provides browser globals for api-ape client
 * - ServerManager spawns and manages api-ape servers
 * - ClientManager creates clients that connect via FakeBrowser
 * - FakeDatabase provides in-memory adapter for cluster testing
 *
 * @module simulator/harness.test
 */

// Import harness components
const {
  Harness,
  FakeBrowser,
  FakeDatabase,
  createFakeDbAdapter,
  ServerManager,
  ClientManager,
} = require("./harness");

// Short timeout for local/virtual tests (no network delay)
jest.setTimeout(5000);

describe("Harness Components", () => {
  describe("FakeBrowser", () => {
    let browser;

    beforeEach(() => {
      browser = new FakeBrowser({ url: "http://localhost:3000" });
    });

    afterEach(() => {
      browser.uninstall();
    });

    test("provides window global when installed", () => {
      expect(global.window).toBeUndefined();

      browser.install();

      expect(global.window).toBeDefined();
      expect(global.window.document).toBeDefined();
      expect(global.window.navigator).toBeDefined();
    });

    test("provides WebSocket class", () => {
      browser.install();

      expect(global.WebSocket).toBeDefined();
      expect(typeof global.WebSocket).toBe("function");
    });

    test("provides navigator.onLine", () => {
      browser.install();

      expect(global.navigator.onLine).toBe(true);

      browser.goOffline();
      expect(global.navigator.onLine).toBe(false);

      browser.goOnline();
      expect(global.navigator.onLine).toBe(true);
    });

    test("restores globals on uninstall", () => {
      const originalWindow = global.window;

      browser.install();
      expect(global.window).toBeDefined();

      browser.uninstall();
      expect(global.window).toBe(originalWindow);
    });

    test("sets location from URL", () => {
      browser.install();

      expect(global.window.location.hostname).toBe("localhost");
      expect(global.window.location.port).toBe("3000");

      browser.setUrl("http://example.com:8080/api");

      expect(global.window.location.hostname).toBe("example.com");
      expect(global.window.location.port).toBe("8080");
      expect(global.window.location.pathname).toBe("/api");
    });

    test("manages cookies", () => {
      browser.install();

      browser.setCookie("session", "abc123");
      expect(global.document.cookie).toContain("session=abc123");

      browser.clearCookies();
      expect(global.document.cookie).toBe("");
    });
  });

  describe("FakeDatabase", () => {
    let db;

    beforeEach(() => {
      db = new FakeDatabase();
    });

    afterEach(() => {
      db.reset();
    });

    test("tracks server join/leave", () => {
      db.joinServer("server-1");
      db.joinServer("server-2");

      expect(db.activeServers.size).toBe(2);
      expect(db.activeServers.has("server-1")).toBe(true);

      db.leaveServer("server-1");

      expect(db.activeServers.size).toBe(1);
      expect(db.activeServers.has("server-1")).toBe(false);
    });

    test("manages client lookup", () => {
      db.addClient("client-1", "server-1");
      db.addClient("client-2", "server-1");
      db.addClient("client-3", "server-2");

      expect(db.readClient("client-1")).toBe("server-1");
      expect(db.readClient("client-3")).toBe("server-2");
      expect(db.readClient("unknown")).toBeNull();

      db.removeClient("client-1");
      expect(db.readClient("client-1")).toBeNull();
    });

    test("handles pub/sub messaging", (done) => {
      const received = [];

      db.subscribe("server-1", (msg) => {
        received.push(msg);
        if (received.length === 1) {
          expect(msg.type).toBe("test");
          expect(msg.data).toBe("hello");
          done();
        }
      });

      db.publish("server-2", "server-1", { type: "test", data: "hello" });
    });

    test("broadcasts to all servers except sender", (done) => {
      const received1 = [];
      const received2 = [];
      const received3 = [];

      db.subscribe("server-1", (msg) => received1.push(msg));
      db.subscribe("server-2", (msg) => received2.push(msg));
      db.subscribe("server-3", (msg) => received3.push(msg));

      db.publish("server-1", "*", { type: "broadcast" });

      // Use setImmediate to wait for async message delivery
      setImmediate(() => {
        setImmediate(() => {
          expect(received1.length).toBe(0); // Sender excluded
          expect(received2.length).toBe(1);
          expect(received3.length).toBe(1);
          done();
        });
      });
    });

    test("cleans up client mappings when server leaves", () => {
      db.addClient("client-1", "server-1");
      db.addClient("client-2", "server-1");
      db.addClient("client-3", "server-2");

      db.leaveServer("server-1");

      expect(db.readClient("client-1")).toBeNull();
      expect(db.readClient("client-2")).toBeNull();
      expect(db.readClient("client-3")).toBe("server-2");
    });
  });

  describe("FakeDbAdapter", () => {
    let db;
    let adapter;

    beforeEach(() => {
      db = new FakeDatabase();
      adapter = createFakeDbAdapter(db, { serverId: "test-server" });
    });

    afterEach(() => {
      db.reset();
    });

    test("has correct serverId", () => {
      expect(adapter.serverId).toBe("test-server");
    });

    test("can join and leave cluster", async () => {
      expect(adapter.isJoined).toBe(false);

      await adapter.join();

      expect(adapter.isJoined).toBe(true);
      expect(db.activeServers.has("test-server")).toBe(true);

      await adapter.leave();

      expect(adapter.isJoined).toBe(false);
      expect(db.activeServers.has("test-server")).toBe(false);
    });

    test("lookup operations work", async () => {
      await adapter.lookup.add("client-abc");

      const owner = await adapter.lookup.read("client-abc");
      expect(owner).toBe("test-server");

      await adapter.lookup.remove("client-abc");

      const afterRemove = await adapter.lookup.read("client-abc");
      expect(afterRemove).toBeNull();
    });

    test("channel operations work", async () => {
      const received = [];

      await adapter.channels.pull("test-server", (msg) => {
        received.push(msg);
      });

      // Publish from "another server"
      db.publish("other-server", "test-server", { type: "hello" });

      await new Promise((r) => setImmediate(r));

      expect(received.length).toBe(1);
      expect(received[0].type).toBe("hello");
    });
  });
});

describe("ServerManager", () => {
  let manager;
  let ServerManager;

  beforeEach(() => {
    // Reset modules to clear api-ape singleton state
    jest.resetModules();
    // Re-require after reset
    ServerManager = require("./harness").ServerManager;
    manager = new ServerManager({ basePort: 5000 });
  });

  afterEach(async () => {
    await manager.closeAll();
  });

  test("creates server on available port", async () => {
    const server = await manager.create({
      where: "test-api",
    });

    expect(server).toBeDefined();
    expect(server.port).toBeGreaterThanOrEqual(5000);
    expect(server.url).toContain("localhost");
    expect(server.closed).toBe(false);
  });

  test("tracks created servers", async () => {
    expect(manager.count).toBe(0);

    await manager.create({ where: "test-api" });
    expect(manager.count).toBe(1);

    await manager.create({ where: "test-api" });
    expect(manager.count).toBe(2);
  });

  test("closes specific server", async () => {
    const server1 = await manager.create({
      where: "test-api",
      id: "server-1",
    });
    const server2 = await manager.create({
      where: "test-api",
      id: "server-2",
    });

    expect(manager.count).toBe(2);

    await manager.close("server-1");

    expect(manager.count).toBe(1);
    expect(manager.get("server-1")).toBeUndefined();
    expect(manager.get("server-2")).toBeDefined();
  });

  test("closes all servers", async () => {
    await manager.create({ where: "test-api" });
    await manager.create({ where: "test-api" });
    await manager.create({ where: "test-api" });

    expect(manager.count).toBe(3);

    await manager.closeAll();

    expect(manager.count).toBe(0);
  });
});

describe("Full Harness Integration", () => {
  let harness;
  let Harness;

  beforeEach(() => {
    // Reset modules to clear api-ape singleton state
    jest.resetModules();
    // Re-require after reset
    Harness = require("./harness").Harness;
    harness = new Harness({ basePort: 6000 });
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  test("createPair creates server and connected client", async () => {
    const { server, client } = await harness.createPair({
      where: "test-api",
    });

    expect(server).toBeDefined();
    expect(client).toBeDefined();
    expect(client.connected).toBe(true);
    expect(client.state).toBe("connected");
  });

  test("client can call echo endpoint", async () => {
    const { server, client } = await harness.createPair({
      where: "test-api",
    });

    const result = await client.call("echo", {
      message: "Hello, World!",
      number: 42,
      nested: { a: 1, b: 2 },
    });

    expect(result.message).toBe("Hello, World!");
    expect(result.number).toBe(42);
    expect(result.nested.a).toBe(1);
  });

  test("createGroup creates server with multiple clients", async () => {
    const { server, clients } = await harness.createGroup(3, {
      where: "test-api",
    });

    expect(server).toBeDefined();
    expect(clients).toHaveLength(3);

    // All clients should be connected
    for (const client of clients) {
      expect(client.connected).toBe(true);
    }

    // Server should see all clients
    await harness.waitFor(() => server.clientCount >= 3);
  });

  test("broadcast reaches other clients", async () => {
    // Reset message store
    const messageModule = require("./test-api/message");
    messageModule._reset();

    const { server, clients } = await harness.createGroup(3, {
      where: "test-api",
    });

    const [alice, bob, charlie] = clients;

    // Set up listeners
    const bobMessages = [];
    const charlieMessages = [];
    const aliceMessages = [];

    bob.on("message", (msg) => bobMessages.push(msg));
    charlie.on("message", (msg) => charlieMessages.push(msg));
    alice.on("message", (msg) => aliceMessages.push(msg));

    // Alice sends a message
    const result = await alice.call("message", {
      text: "Hello everyone!",
      user: "Alice",
    });

    expect(result.success).toBe(true);

    // Wait for broadcasts to be received (instant in local testing)
    await harness.wait(10);

    // Bob and Charlie should receive, Alice should not
    expect(bobMessages.length).toBe(1);
    expect(charlieMessages.length).toBe(1);
    expect(aliceMessages.length).toBe(0);

    expect(bobMessages[0].data.text).toBe("Hello everyone!");
    expect(bobMessages[0].data.user).toBe("Alice");
  });

  test("waitFor helper waits for condition", async () => {
    const server = await harness.createServer({ where: "test-api" });

    // Create clients with a slight delay
    setTimeout(async () => {
      await harness.createClientForServer(server);
      await harness.createClientForServer(server);
    }, 10);

    // Wait for 2 clients to connect (short timeout for local testing)
    await harness.waitFor(() => server.clientCount >= 2, 500);

    expect(server.clientCount).toBeGreaterThanOrEqual(2);
  });

  test("cleanup closes all resources", async () => {
    await harness.createPair({ where: "test-api" });
    await harness.createPair({ where: "test-api" });

    expect(harness.servers.count).toBe(2);
    expect(harness.clients.count).toBe(2);

    await harness.cleanup();

    expect(harness.servers.count).toBe(0);
    expect(harness.clients.count).toBe(0);
  });

  test("getState returns harness status", async () => {
    await harness.createGroup(2, { where: "test-api" });

    const state = harness.getState();

    expect(state.servers).toHaveLength(1);
    expect(state.clients).toHaveLength(2);
    expect(state.uptime).toBeGreaterThan(0);
  });
});

describe("Transport Modes", () => {
  let harness;
  let Harness;

  beforeEach(() => {
    // Reset modules to clear api-ape singleton state
    jest.resetModules();
    // Re-require after reset
    Harness = require("./harness").Harness;
    harness = new Harness({ basePort: 7000 });
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  test("client connects via WebSocket by default", async () => {
    const { client } = await harness.createPair({ where: "test-api" });

    expect(client.transport).toBe("websocket");
  });

  // TODO: HTTP polling transport requires SSE stream parsing implementation
  test.skip("client can force polling transport", async () => {
    const server = await harness.createServer({ where: "test-api" });

    const client = await harness.createClientForServer(server, {
      transport: "polling",
    });

    expect(client.transport).toBe("polling");

    // Should still be able to make calls
    const result = await client.call("echo", { test: true });
    expect(result.test).toBe(true);
  });
});

describe("Client Message Buffering", () => {
  let harness;
  let Harness;

  beforeEach(() => {
    // Reset modules to clear api-ape singleton state
    jest.resetModules();
    // Re-require after reset
    Harness = require("./harness").Harness;
    harness = new Harness({ basePort: 8000 });
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  test("waitFor returns existing buffered message", async () => {
    const messageModule = require("./test-api/message");
    messageModule._reset();

    const { server, clients } = await harness.createGroup(2, {
      where: "test-api",
    });

    const [alice, bob] = clients;

    // Register handler to buffer messages
    bob.on("message", () => {});

    // Alice sends a message
    await alice.call("message", { text: "Buffered message" });

    // Give time for message to arrive (instant locally)
    await harness.wait(10);

    // waitFor should find the buffered message
    const msg = await bob.waitFor("message", 200);

    expect(msg.data.text).toBe("Buffered message");
  });

  test("clearMessages clears the buffer", async () => {
    const { client } = await harness.createPair({ where: "test-api" });

    // Manually add a message to the buffer
    client.receivedMessages.push({
      type: "test",
      data: {},
      timestamp: Date.now(),
    });

    expect(client.receivedMessages.length).toBe(1);

    client.clearMessages();

    expect(client.receivedMessages.length).toBe(0);
  });

  test("getMessages filters by type", async () => {
    const { client } = await harness.createPair({ where: "test-api" });

    // Add various messages
    client.receivedMessages.push({
      type: "chat",
      data: { id: 1 },
      timestamp: Date.now(),
    });
    client.receivedMessages.push({
      type: "notification",
      data: { id: 2 },
      timestamp: Date.now(),
    });
    client.receivedMessages.push({
      type: "chat",
      data: { id: 3 },
      timestamp: Date.now(),
    });

    const chatMessages = client.getMessages("chat");

    expect(chatMessages).toHaveLength(2);
    expect(chatMessages[0].data.id).toBe(1);
    expect(chatMessages[1].data.id).toBe(3);
  });
});
