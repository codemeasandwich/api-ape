/**
 * @fileoverview Tests for chained publish proxy
 */

const createPublishProxy = require("./publishProxy");

// Mock the pubsub module
jest.mock("./pubsub", () => ({
  publish: jest.fn(),
}));

const { publish } = require("./pubsub");

describe("Publish Proxy", () => {
  let publishProxy;

  beforeEach(() => {
    jest.clearAllMocks();
    publishProxy = createPublishProxy();
  });

  describe("chained syntax", () => {
    it("should build single-level paths", () => {
      publishProxy.health({ status: "ok" });

      expect(publish).toHaveBeenCalledWith("/health", { status: "ok" });
    });

    it("should build nested paths", () => {
      publishProxy.news.banking({ headline: "Update" });

      expect(publish).toHaveBeenCalledWith("/news/banking", {
        headline: "Update",
      });
    });

    it("should build deeply nested paths", () => {
      publishProxy.stocks.nasdaq.tech({ price: 100 });

      expect(publish).toHaveBeenCalledWith("/stocks/nasdaq/tech", {
        price: 100,
      });
    });

    it("should handle undefined data", () => {
      publishProxy.ping();

      expect(publish).toHaveBeenCalledWith("/ping", undefined);
    });

    it("should handle null data", () => {
      publishProxy.channel(null);

      expect(publish).toHaveBeenCalledWith("/channel", null);
    });

    it("should handle array data", () => {
      publishProxy.list([1, 2, 3]);

      expect(publish).toHaveBeenCalledWith("/list", [1, 2, 3]);
    });

    it("should handle string data", () => {
      publishProxy.message("hello");

      expect(publish).toHaveBeenCalledWith("/message", "hello");
    });
  });

  describe("legacy syntax (direct call)", () => {
    it("should support direct function call with channel and data", () => {
      publishProxy("/health", { status: "ok" });

      expect(publish).toHaveBeenCalledWith("/health", { status: "ok" });
    });

    it("should support direct function call with nested channel", () => {
      publishProxy("/news/banking", { headline: "Update" });

      expect(publish).toHaveBeenCalledWith("/news/banking", {
        headline: "Update",
      });
    });
  });

  describe("multiple publishes", () => {
    it("should handle multiple independent publishes", () => {
      publishProxy.channel1({ a: 1 });
      publishProxy.channel2({ b: 2 });
      publishProxy.channel3({ c: 3 });

      expect(publish).toHaveBeenCalledTimes(3);
      expect(publish).toHaveBeenNthCalledWith(1, "/channel1", { a: 1 });
      expect(publish).toHaveBeenNthCalledWith(2, "/channel2", { b: 2 });
      expect(publish).toHaveBeenNthCalledWith(3, "/channel3", { c: 3 });
    });

    it("should not share state between chains", () => {
      const chain1 = publishProxy.a;
      const chain2 = publishProxy.b;

      chain1.sub({ x: 1 });
      chain2.sub({ y: 2 });

      expect(publish).toHaveBeenCalledWith("/a/sub", { x: 1 });
      expect(publish).toHaveBeenCalledWith("/b/sub", { y: 2 });
    });
  });

  describe("edge cases", () => {
    it("should handle numeric property names", () => {
      publishProxy.stock["123"]({ price: 50 });

      expect(publish).toHaveBeenCalledWith("/stock/123", { price: 50 });
    });

    it("should handle special characters in bracket notation", () => {
      publishProxy.channel["sub-channel"]({ data: 1 });

      expect(publish).toHaveBeenCalledWith("/channel/sub-channel", { data: 1 });
    });
  });
});
