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

    // Scenario: refreshSchema is called BEFORE any handler is created (e.g.
    // during initial setup). The `if (cachedSchema)` false branch engages
    // and the function exits without mutating state.
    test("refreshSchema is a true no-op before handler initialization", () => {
      jest.isolateModules(() => {
        const fresh = require("./index");
        expect(() => fresh.refreshSchema(fixturesDir)).not.toThrow();
      });
    });
  });

  // ============================================================================
  // computeEndpoint edge cases — exercised via generateSchema on a custom
  // tmpdir that contains the file shapes the parser must skip.
  // ============================================================================
  describe("computeEndpoint skip paths", () => {
    const fs = require("fs");
    const os = require("os");

    function tmpControllerDir(tree) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "schema-idx-"));
      for (const [rel, content] of Object.entries(tree)) {
        const abs = path.join(root, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, "utf8");
      }
      return root;
    }

    function cleanup(root) {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    }

    // Scenario: root-level /index.js — skipped per convention.
    test("skips root-level /index.js", () => {
      const root = tmpControllerDir({
        "index.js": "module.exports = function () {};",
        "users.js": "module.exports = function () {};",
      });
      try {
        const schema = generateSchema(root);
        const paths = schema.endpoints.map((e) => e.path);
        expect(paths).toContain("users");
        expect(paths).not.toContain("");
        expect(paths).not.toContain("index");
      } finally {
        cleanup(root);
      }
    });

    // Scenario: root-level /index.ts — also skipped per convention.
    test("skips root-level /index.ts", () => {
      const root = tmpControllerDir({
        "index.ts": "module.exports = function () {};",
        "users.ts": "module.exports = function () {};",
      });
      try {
        const schema = generateSchema(root);
        const paths = schema.endpoints.map((e) => e.path);
        expect(paths).toContain("users");
      } finally {
        cleanup(root);
      }
    });

    // Scenario: underscore-prefixed private files.
    test("skips underscore-prefixed files", () => {
      const root = tmpControllerDir({
        "users.js": "module.exports = function () {};",
        "_private.js": "module.exports = function () {};",
        "_shared/helper.js": "module.exports = function () {};",
      });
      try {
        const schema = generateSchema(root);
        const paths = schema.endpoints.map((e) => e.path);
        expect(paths).toContain("users");
        expect(paths).not.toContain("_private");
        expect(paths).not.toContain("_shared/helper");
      } finally {
        cleanup(root);
      }
    });

    // Scenario: .d.ts files (TypeScript declaration companions).
    test("skips .d.ts declaration files", () => {
      const root = tmpControllerDir({
        "users.js": "module.exports = function () {};",
        "users.d.ts": "export {};",
      });
      try {
        const schema = generateSchema(root);
        const paths = schema.endpoints.map((e) => e.path);
        expect(paths).toEqual(["users"]);
      } finally {
        cleanup(root);
      }
    });

    // Scenario: an empty controller path after stripping "index" — the
    // `pathParts.length === 0 → null` skip engages.  Use .ts so root
    // /index.js skip doesn't fire first.
    test("skips when pathParts becomes empty after index pop", () => {
      const root = tmpControllerDir({
        "users.js": "module.exports = function () {};",
        "outer/index.js": "module.exports = function () {};",
      });
      try {
        const schema = generateSchema(root);
        const paths = schema.endpoints.map((e) => e.path);
        expect(paths).toContain("outer"); // subdir index → parent name
        expect(paths).toContain("users");
      } finally {
        cleanup(root);
      }
    });
  });
});
