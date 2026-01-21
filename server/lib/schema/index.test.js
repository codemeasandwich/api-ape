/**
 * @fileoverview Tests for Schema Endpoint
 *
 * Tests the HTTP handler for schema introspection.
 */

const path = require("path");
const {
  createSchemaHandler,
  refreshSchema,
  generateSchema,
} = require("./index");

// Use test fixtures directory
const fixturesDir = path.join(__dirname, "__fixtures__");

describe("Schema Endpoint", () => {
  describe("generateSchema", () => {
    test("returns schema with version and endpoints", () => {
      const schema = generateSchema(fixturesDir);

      expect(schema.version).toBeDefined();
      expect(schema.timestamp).toBeDefined();
      expect(schema.controllersDir).toBe(fixturesDir);
      expect(Array.isArray(schema.endpoints)).toBe(true);
    });

    test("generates version hash from endpoints", () => {
      const schema = generateSchema(fixturesDir);

      expect(typeof schema.version).toBe("string");
      expect(schema.version.length).toBe(8);
    });
  });

  describe("createSchemaHandler", () => {
    let handler;
    let mockReq;
    let mockRes;

    beforeEach(() => {
      handler = createSchemaHandler(fixturesDir);
      mockReq = {
        headers: {},
      };
      mockRes = {
        setHeader: jest.fn(),
        writeHead: jest.fn(),
        end: jest.fn(),
      };
    });

    test("returns 200 with schema JSON", () => {
      handler(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200);
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/json"
      );
      expect(mockRes.end).toHaveBeenCalled();

      const responseBody = mockRes.end.mock.calls[0][0];
      const parsed = JSON.parse(responseBody);
      expect(parsed.version).toBeDefined();
    });

    test("sets CORS headers", () => {
      handler(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        "Access-Control-Allow-Origin",
        "*"
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        "Access-Control-Allow-Methods",
        "GET, OPTIONS"
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        "Access-Control-Allow-Headers",
        "Content-Type"
      );
    });

    test("sets ETag header", () => {
      handler(mockReq, mockRes);

      const etagCalls = mockRes.setHeader.mock.calls.filter(
        (call) => call[0] === "ETag"
      );
      expect(etagCalls.length).toBe(1);
      expect(typeof etagCalls[0][1]).toBe("string");
    });

    test("sets Cache-Control header", () => {
      handler(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "no-cache"
      );
    });

    test("returns 304 when If-None-Match matches ETag", () => {
      // First request to get the ETag
      handler(mockReq, mockRes);
      const etagCall = mockRes.setHeader.mock.calls.find(
        (call) => call[0] === "ETag"
      );
      const etag = etagCall[1];

      // Reset mocks for second request
      mockRes.setHeader.mockClear();
      mockRes.writeHead.mockClear();
      mockRes.end.mockClear();

      // Second request with matching If-None-Match
      mockReq.headers["if-none-match"] = etag;
      handler(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(304);
      expect(mockRes.end).toHaveBeenCalledWith();
      expect(mockRes.setHeader).not.toHaveBeenCalled();
    });

    test("returns 200 when If-None-Match does not match", () => {
      mockReq.headers["if-none-match"] = "wrong-etag";
      handler(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200);
    });
  });

  describe("refreshSchema", () => {
    test("updates cached schema", () => {
      // Create handler to initialize cache
      const handler = createSchemaHandler(fixturesDir);
      const mockRes = {
        setHeader: jest.fn(),
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      // Get initial schema
      handler({ headers: {} }, mockRes);
      const initial = JSON.parse(mockRes.end.mock.calls[0][0]);

      // Refresh and verify timestamp changes
      // Wait a tick to ensure different timestamp
      const now = Date.now();
      while (Date.now() <= now) {
        // busy wait for 1ms
      }

      refreshSchema(fixturesDir);

      // Get refreshed schema
      mockRes.end.mockClear();
      handler({ headers: {} }, mockRes);
      const refreshed = JSON.parse(mockRes.end.mock.calls[0][0]);

      expect(refreshed.version).toBe(initial.version); // Same endpoints = same hash
      expect(refreshed.timestamp).toBeGreaterThan(initial.timestamp);
    });

    test("does nothing when cache is not initialized", () => {
      // This should not throw
      expect(() => refreshSchema(fixturesDir)).not.toThrow();
    });
  });
});
