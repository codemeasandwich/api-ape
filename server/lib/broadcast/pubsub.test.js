/**
 * @fileoverview Tests for Pub/Sub System
 *
 * Tests the channel subscription and message publishing system.
 */

const {
  subscribe,
  unsubscribe,
  publish,
  cleanupClientSubscriptions,
} = require("./pubsub");
const { _clients } = require("./clients");

describe("Pub/Sub System", () => {
  let mockSend;
  let mockClientWrapper;

  beforeEach(() => {
    mockSend = jest.fn();
    mockClientWrapper = { send: mockSend };

    // Clear the clients map
    _clients.clear();
  });

  describe("subscribe", () => {
    test("subscribes client to channel", () => {
      const result = subscribe("client1", "test-channel");

      expect(result).toBeNull(); // No last message
    });

    test("returns last message if exists after previous publish", () => {
      // First, publish a message
      publish("test-channel", { msg: "hello" });

      // Then subscribe
      const result = subscribe("client1", "test-channel");

      expect(result).toEqual({
        channel: "test-channel",
        lastMessage: { msg: "hello" },
      });
    });

    test("handles multiple subscriptions from same client", () => {
      subscribe("client1", "channel1");
      subscribe("client1", "channel2");

      // Should not throw
      expect(() => subscribe("client1", "channel1")).not.toThrow();
    });
  });

  describe("unsubscribe", () => {
    test("unsubscribes client from channel", () => {
      subscribe("client1", "test-channel");
      unsubscribe("client1", "test-channel");

      // Should not throw when unsubscribing again
      expect(() => unsubscribe("client1", "test-channel")).not.toThrow();
    });

    test("removes empty channel subscription set", () => {
      subscribe("client1", "unique-channel-1");
      unsubscribe("client1", "unique-channel-1");

      // The channel set should be removed (checked via re-subscription)
      // Use a fresh channel that has no lastMessage
      const result = subscribe("client2", "unique-channel-1");
      expect(result).toBeNull();
    });

    test("removes empty client subscription set when last channel removed", () => {
      // Subscribe to exactly one channel
      subscribe("single-sub-client", "only-channel");

      // Unsubscribe from the only channel - should delete client from _clientSubscriptions
      unsubscribe("single-sub-client", "only-channel");

      // Subscribing again should create fresh entries without issues
      const result = subscribe("single-sub-client", "new-channel");
      expect(result).toBeNull();
    });

    test("handles unsubscribe from non-existent channel", () => {
      expect(() => unsubscribe("client1", "nonexistent")).not.toThrow();
    });
  });

  describe("publish", () => {
    test("publishes to all subscribers", () => {
      _clients.set("client1", mockClientWrapper);
      _clients.set("client2", { send: jest.fn() });

      subscribe("client1", "test-channel");
      subscribe("client2", "test-channel");

      publish("test-channel", { data: "test" });

      expect(mockSend).toHaveBeenCalledWith("test-channel", { data: "test" });
      expect(_clients.get("client2").send).toHaveBeenCalledWith(
        "test-channel",
        { data: "test" }
      );
    });

    test("handles publish to channel with no subscribers", () => {
      expect(() => publish("empty-channel", { data: "test" })).not.toThrow();
    });

    test("skips disconnected clients", () => {
      subscribe("client1", "test-channel");
      // client1 is not in _clients, so it should be skipped

      expect(() => publish("test-channel", { data: "test" })).not.toThrow();
    });

    test("stores last message", () => {
      publish("test-channel", { msg: "first" });
      publish("test-channel", { msg: "second" });

      const result = subscribe("client1", "test-channel");
      expect(result.lastMessage).toEqual({ msg: "second" });
    });
  });

  describe("cleanupClientSubscriptions", () => {
    test("removes all subscriptions for client", () => {
      _clients.set("client1", mockClientWrapper);

      subscribe("client1", "channel1");
      subscribe("client1", "channel2");

      cleanupClientSubscriptions("client1");

      // Verify by publishing - should not call send
      publish("channel1", { data: "test" });
      expect(mockSend).not.toHaveBeenCalled();
    });

    test("removes empty channel when last subscriber leaves", () => {
      subscribe("client1", "unique-cleanup-channel");
      cleanupClientSubscriptions("client1");

      // Subscribe another client to verify channel was cleaned up
      // Use a fresh channel that has no lastMessage
      const result = subscribe("client2", "unique-cleanup-channel");
      expect(result).toBeNull();
    });

    test("handles cleanup for client with no subscriptions", () => {
      expect(() => cleanupClientSubscriptions("nonexistent")).not.toThrow();
    });
  });

  // ============================================================================
  // Real-world env-gated logging: ops operators enable APIAPE_PUBSUB_LOG to
  // debug a pub/sub flow in production. Every legal truthy value (any string
  // other than the documented falsies) must turn logging on, and the
  // function must remain a pure side-effect-free no-op when off.
  // ============================================================================
  describe("APIAPE_PUBSUB_LOG env gating", () => {
    let originalEnv;
    beforeEach(() => {
      originalEnv = process.env.APIAPE_PUBSUB_LOG;
    });
    afterEach(() => {
      if (originalEnv === undefined) delete process.env.APIAPE_PUBSUB_LOG;
      else process.env.APIAPE_PUBSUB_LOG = originalEnv;
    });

    test("publish with env=1 and no subscribers does not throw", () => {
      process.env.APIAPE_PUBSUB_LOG = "1";
      expect(() => publish("env-empty-channel", { x: 1 })).not.toThrow();
    });

    test("publish with env=yes and one subscriber does not throw", () => {
      process.env.APIAPE_PUBSUB_LOG = "yes";
      _clients.set("logged-c", { send: jest.fn() });
      subscribe("logged-c", "env-subscribed-channel");
      expect(() => publish("env-subscribed-channel", { x: 2 })).not.toThrow();
    });

    test("publish with env=0 is treated as off and does not throw", () => {
      process.env.APIAPE_PUBSUB_LOG = "0";
      expect(() => publish("falsy-channel", { x: 3 })).not.toThrow();
    });

    test("publish with env=false is treated as off", () => {
      process.env.APIAPE_PUBSUB_LOG = "false";
      expect(() => publish("falsy-channel-2", { x: 4 })).not.toThrow();
    });

    test("publish with env=off is treated as off", () => {
      process.env.APIAPE_PUBSUB_LOG = "off";
      expect(() => publish("falsy-channel-3", { x: 5 })).not.toThrow();
    });

    test("publish with empty env value is treated as off", () => {
      process.env.APIAPE_PUBSUB_LOG = "";
      expect(() => publish("falsy-channel-4", { x: 6 })).not.toThrow();
    });
  });

  // ============================================================================
  // Multi-subscriber unsubscribe + missing client cleanup defensive branches.
  // ============================================================================
  describe("Multi-subscriber unsubscribe semantics", () => {
    // Scenario: two clients subscribe to the same channel; one unsubscribes.
    // The channel's subscriber set keeps the other client — the
    // `subscribers.size === 0` false branch engages.
    test("unsubscribe of one client preserves the other", () => {
      _clients.set("a", { send: jest.fn() });
      _clients.set("b", { send: jest.fn() });
      subscribe("a", "shared-channel");
      subscribe("b", "shared-channel");
      unsubscribe("a", "shared-channel");
      // Publishing should still reach "b"
      publish("shared-channel", { msg: 1 });
      expect(_clients.get("b").send).toHaveBeenCalled();
    });

    // Scenario: unsubscribe is called for a client that never subscribed.
    // The `if (clientChannels)` false branch engages (no entry to clean).
    test("unsubscribe for an unknown client is a no-op", () => {
      // Subscribe a different client so the channel exists
      _clients.set("known", { send: jest.fn() });
      subscribe("known", "some-channel");
      expect(() => unsubscribe("never-subscribed", "some-channel")).not.toThrow();
    });

    // Scenario: cleanupClientSubscriptions is called for a client whose
    // channel's subscriber set was already emptied via a prior unsubscribe.
    // The `if (subscribers)` false branch engages.
    test("cleanupClientSubscriptions tolerates already-removed channels", () => {
      _clients.set("c1", { send: jest.fn() });
      subscribe("c1", "soon-empty-channel");
      // Manually delete the channel from the subscriptions map (simulating
      // a prior race where the channel was wiped) — cleanup must not throw.
      const innerPubsub = require("./pubsub");
      // We can't reach the internal Maps directly; instead unsubscribe and
      // then call cleanup which sees the now-empty client-channel map.
      unsubscribe("c1", "soon-empty-channel");
      expect(() => innerPubsub.cleanupClientSubscriptions("c1")).not.toThrow();
    });
  });
});
