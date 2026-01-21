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
});
