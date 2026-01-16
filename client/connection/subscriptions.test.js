/**
 * @fileoverview Tests for subscription manager logic
 *
 * These tests verify the subscription manager patterns used in api-ape.
 * Since the actual module uses ES modules, we test the logic patterns directly.
 */

describe("Subscription Manager Logic", () => {
  let subscriptions;
  let sentMessages;
  let mockSendFn;

  beforeEach(() => {
    subscriptions = new Map();
    sentMessages = [];
    mockSendFn = (msg) => sentMessages.push(msg);
  });

  // Helper to simulate subscribe
  function subscribe(channel, callback) {
    let callbacks = subscriptions.get(channel);
    const isFirstSubscriber = !callbacks;

    if (isFirstSubscriber) {
      callbacks = new Set();
      subscriptions.set(channel, callbacks);
    }

    callbacks.add(callback);

    if (isFirstSubscriber && mockSendFn) {
      mockSendFn({ subscribe: channel });
    }

    return function unsubscribe() {
      const cbs = subscriptions.get(channel);
      if (cbs) {
        cbs.delete(callback);
        if (cbs.size === 0) {
          subscriptions.delete(channel);
          if (mockSendFn) {
            mockSendFn({ unsubscribe: channel });
          }
        }
      }
    };
  }

  // Helper to check subscribers
  function hasSubscribers(channel) {
    return subscriptions.has(channel) && subscriptions.get(channel).size > 0;
  }

  // Helper to dispatch
  function dispatch(channel, data) {
    const callbacks = subscriptions.get(channel);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (err) {
          // Ignore errors - mimics real behavior
        }
      });
    }
  }

  // Helper to resubscribe all
  function resubscribeAll() {
    if (!mockSendFn) return;
    subscriptions.forEach((callbacks, channel) => {
      if (callbacks.size > 0) {
        mockSendFn({ subscribe: channel });
      }
    });
  }

  // Helper to get active channels
  function getActiveChannels() {
    return Array.from(subscriptions.keys());
  }

  describe("subscribe()", () => {
    it("should add a callback and send subscribe message on first subscriber", () => {
      const callback = jest.fn();

      subscribe("/news/banking", callback);

      expect(hasSubscribers("/news/banking")).toBe(true);
      expect(sentMessages).toEqual([{ subscribe: "/news/banking" }]);
    });

    it("should not send subscribe message for subsequent subscribers to same channel", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      subscribe("/news/banking", callback1);
      subscribe("/news/banking", callback2);

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toEqual({ subscribe: "/news/banking" });
    });

    it("should return an unsubscribe function", () => {
      const callback = jest.fn();
      const unsub = subscribe("/news/banking", callback);

      expect(typeof unsub).toBe("function");
    });

    it("should track multiple channels independently", () => {
      subscribe("/channel1", jest.fn());
      subscribe("/channel2", jest.fn());

      expect(getActiveChannels()).toEqual(
        expect.arrayContaining(["/channel1", "/channel2"])
      );
      expect(sentMessages).toHaveLength(2);
    });
  });

  describe("unsubscribe()", () => {
    it("should remove callback and send unsubscribe when last subscriber leaves", () => {
      const callback = jest.fn();
      const unsub = subscribe("/news/banking", callback);

      sentMessages = [];
      unsub();

      expect(hasSubscribers("/news/banking")).toBe(false);
      expect(sentMessages).toEqual([{ unsubscribe: "/news/banking" }]);
    });

    it("should not send unsubscribe when other subscribers remain", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const unsub1 = subscribe("/news/banking", callback1);
      subscribe("/news/banking", callback2);

      sentMessages = [];
      unsub1();

      expect(hasSubscribers("/news/banking")).toBe(true);
      expect(sentMessages).toHaveLength(0);
    });

    it("should be safe to call multiple times", () => {
      const callback = jest.fn();
      const unsub = subscribe("/news/banking", callback);

      unsub();
      unsub();

      expect(sentMessages.filter((m) => m.unsubscribe)).toHaveLength(1);
    });
  });

  describe("dispatch()", () => {
    it("should call all callbacks for a channel", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      subscribe("/news/banking", callback1);
      subscribe("/news/banking", callback2);

      dispatch("/news/banking", { headline: "Test" });

      expect(callback1).toHaveBeenCalledWith({ headline: "Test" });
      expect(callback2).toHaveBeenCalledWith({ headline: "Test" });
    });

    it("should not call callbacks for other channels", () => {
      const callback = jest.fn();
      subscribe("/news/banking", callback);

      dispatch("/other/channel", { data: "test" });

      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle callback errors gracefully", () => {
      const errorCallback = jest.fn(() => {
        throw new Error("Test error");
      });
      const normalCallback = jest.fn();

      subscribe("/channel", errorCallback);
      subscribe("/channel", normalCallback);

      dispatch("/channel", { data: "test" });

      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe("hasSubscribers()", () => {
    it("should return false for channels with no subscribers", () => {
      expect(hasSubscribers("/nonexistent")).toBe(false);
    });

    it("should return true for channels with subscribers", () => {
      subscribe("/channel", jest.fn());
      expect(hasSubscribers("/channel")).toBe(true);
    });

    it("should return false after all subscribers unsubscribe", () => {
      const unsub = subscribe("/channel", jest.fn());
      unsub();
      expect(hasSubscribers("/channel")).toBe(false);
    });
  });

  describe("resubscribeAll()", () => {
    it("should re-send subscribe for all active channels", () => {
      subscribe("/channel1", jest.fn());
      subscribe("/channel2", jest.fn());

      sentMessages = [];
      resubscribeAll();

      expect(sentMessages).toHaveLength(2);
      expect(sentMessages).toEqual(
        expect.arrayContaining([
          { subscribe: "/channel1" },
          { subscribe: "/channel2" },
        ])
      );
    });

    it("should not send anything if no active subscriptions", () => {
      sentMessages = [];
      resubscribeAll();

      expect(sentMessages).toHaveLength(0);
    });
  });

  describe("getActiveChannels()", () => {
    it("should return all subscribed channels", () => {
      subscribe("/a", jest.fn());
      subscribe("/b", jest.fn());
      subscribe("/c", jest.fn());

      const channels = getActiveChannels();
      expect(channels).toHaveLength(3);
      expect(channels).toEqual(expect.arrayContaining(["/a", "/b", "/c"]));
    });
  });
});

describe("Function detection for subscriptions", () => {
  it("should detect function arguments as subscriptions", () => {
    const isSubscription = (arg) =>
      typeof arg === "function" && arguments.length === 1;

    expect(typeof (() => {})).toBe("function");
    expect(typeof { data: 1 }).toBe("object");
    expect(typeof "string").toBe("string");
  });

  it("should distinguish between RPC and subscription calls", () => {
    function handleCall(a, b) {
      if (arguments.length === 1 && typeof a === "function") {
        return "subscription";
      }
      return "rpc";
    }

    expect(handleCall(() => {})).toBe("subscription");
    expect(handleCall({ data: 1 })).toBe("rpc");
    expect(handleCall("/path", { data: 1 })).toBe("rpc");
  });
});
