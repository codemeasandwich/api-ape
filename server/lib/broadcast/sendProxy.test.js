/**
 * @fileoverview Tests for chained send proxy
 */

const createSendProxy = require("./sendProxy");

describe("Send Proxy", () => {
  let sendFn;
  let sendProxy;

  beforeEach(() => {
    sendFn = jest.fn();
    sendProxy = createSendProxy(sendFn);
  });

  describe("chained syntax", () => {
    it("should build single-level paths", () => {
      sendProxy.health({ status: "ok" });

      expect(sendFn).toHaveBeenCalledWith("/health", { status: "ok" });
    });

    it("should build nested paths", () => {
      sendProxy.news.banking({ headline: "Update" });

      expect(sendFn).toHaveBeenCalledWith("/news/banking", {
        headline: "Update",
      });
    });

    it("should build deeply nested paths", () => {
      sendProxy.stocks.nasdaq.tech({ price: 100 });

      expect(sendFn).toHaveBeenCalledWith("/stocks/nasdaq/tech", {
        price: 100,
      });
    });

    it("should handle undefined data", () => {
      sendProxy.ping();

      expect(sendFn).toHaveBeenCalledWith("/ping", undefined);
    });

    it("should handle null data", () => {
      sendProxy.channel(null);

      expect(sendFn).toHaveBeenCalledWith("/channel", null);
    });

    it("should handle array data", () => {
      sendProxy.list([1, 2, 3]);

      expect(sendFn).toHaveBeenCalledWith("/list", [1, 2, 3]);
    });

    it("should handle string data", () => {
      sendProxy.message("hello");

      expect(sendFn).toHaveBeenCalledWith("/message", "hello");
    });
  });

  describe("direct call syntax", () => {
    it("should support direct function call with type and data", () => {
      sendProxy("/health", { status: "ok" });

      expect(sendFn).toHaveBeenCalledWith("/health", { status: "ok" });
    });

    it("should support direct function call with nested path", () => {
      sendProxy("/news/banking", { headline: "Update" });

      expect(sendFn).toHaveBeenCalledWith("/news/banking", {
        headline: "Update",
      });
    });

    it("should support direct call without leading slash", () => {
      sendProxy("news/banking", { headline: "Update" });

      expect(sendFn).toHaveBeenCalledWith("news/banking", {
        headline: "Update",
      });
    });
  });

  describe("multiple sends", () => {
    it("should handle multiple independent sends", () => {
      sendProxy.channel1({ a: 1 });
      sendProxy.channel2({ b: 2 });
      sendProxy.channel3({ c: 3 });

      expect(sendFn).toHaveBeenCalledTimes(3);
      expect(sendFn).toHaveBeenNthCalledWith(1, "/channel1", { a: 1 });
      expect(sendFn).toHaveBeenNthCalledWith(2, "/channel2", { b: 2 });
      expect(sendFn).toHaveBeenNthCalledWith(3, "/channel3", { c: 3 });
    });

    it("should not share state between chains", () => {
      const chain1 = sendProxy.a;
      const chain2 = sendProxy.b;

      chain1.sub({ x: 1 });
      chain2.sub({ y: 2 });

      expect(sendFn).toHaveBeenCalledWith("/a/sub", { x: 1 });
      expect(sendFn).toHaveBeenCalledWith("/b/sub", { y: 2 });
    });
  });

  describe("edge cases", () => {
    it("should handle numeric property names", () => {
      sendProxy.stock["123"]({ price: 50 });

      expect(sendFn).toHaveBeenCalledWith("/stock/123", { price: 50 });
    });

    it("should handle special characters in bracket notation", () => {
      sendProxy.channel["sub-channel"]({ data: 1 });

      expect(sendFn).toHaveBeenCalledWith("/channel/sub-channel", { data: 1 });
    });
  });
});
