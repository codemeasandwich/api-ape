const jss = require("../jss");
const { clearPlugins, builtInTags, hasPlugin } = require("./plugins");

describe("JSS Custom Plugins", () => {
  // Clear plugins before each test to ensure isolation
  beforeEach(() => {
    clearPlugins();
  });

  describe("Plugin Registration", () => {
    test("registers a custom plugin successfully", () => {
      jss.custom("X", {
        check: (key, val) => val && typeof val.custom === "number",
        encode: (path, key, val) => val.custom * 2,
        decode: (val) => ({ custom: val / 2 }),
      });

      expect(hasPlugin("X")).toBe(true);
    });

    test("throws on duplicate tag registration", () => {
      jss.custom("Y", {
        check: () => true,
        encode: () => {},
        decode: () => {},
      });

      expect(() =>
        jss.custom("Y", {
          check: () => true,
          encode: () => {},
          decode: () => {},
        }),
      ).toThrow("already registered");
    });

    test("throws on built-in tag conflict", () => {
      // Test each built-in tag
      for (const tag of builtInTags) {
        expect(() =>
          jss.custom(tag, {
            check: () => true,
            encode: () => {},
            decode: () => {},
          }),
        ).toThrow("conflicts with built-in");
      }
    });

    test("throws on invalid tag format - multi-character", () => {
      expect(() =>
        jss.custom("XX", {
          check: () => true,
          encode: () => {},
          decode: () => {},
        }),
      ).toThrow("single character");
    });

    test("throws on invalid tag format - empty string", () => {
      expect(() =>
        jss.custom("", {
          check: () => true,
          encode: () => {},
          decode: () => {},
        }),
      ).toThrow("single character");
    });

    test("throws if check function is missing", () => {
      expect(() =>
        jss.custom("Z", {
          encode: () => {},
          decode: () => {},
        }),
      ).toThrow("check");
    });

    test("throws if encode function is missing", () => {
      expect(() =>
        jss.custom("Z", {
          check: () => true,
          decode: () => {},
        }),
      ).toThrow("encode");
    });

    test("throws if decode function is missing", () => {
      expect(() =>
        jss.custom("Z", {
          check: () => true,
          encode: () => {},
        }),
      ).toThrow("decode");
    });

    // Scenario: a plugin author passes a non-function as the optional `onSend`
    // hook (e.g. mistakenly passes an object literal or string). The validator
    // must reject the registration so the wire-side hook never gets invoked
    // as if it were a callback.
    test("throws if onSend provided but not a function", () => {
      expect(() =>
        jss.custom("Q", {
          check: () => true,
          encode: () => {},
          decode: () => {},
          onSend: "not a function",
        }),
      ).toThrow("'onSend' must be a function");
    });

    // Scenario: a plugin author passes a non-function as the optional
    // `onReceive` hook. The validator must reject the registration so the
    // receive-side hook never gets invoked as if it were a callback.
    test("throws if onReceive provided but not a function", () => {
      expect(() =>
        jss.custom("J", {
          check: () => true,
          encode: () => {},
          decode: () => {},
          onReceive: 42,
        }),
      ).toThrow("'onReceive' must be a function");
    });
  });

  describe("Encode/Decode Round-trip", () => {
    test("encodes and decodes custom type correctly", () => {
      jss.custom("X", {
        check: (key, val) => val && typeof val.customValue === "number",
        encode: (path, key, val) => val.customValue * 2,
        decode: (val) => ({ customValue: val / 2 }),
      });

      const input = { data: { customValue: 10 } };
      const encoded = jss.encode(input);

      // Check that the key is tagged
      expect(encoded["data<!X>"]).toBe(20);

      // Check round-trip
      const result = jss.parse(jss.stringify(input));
      expect(result.data.customValue).toBe(10);
    });

    test("handles nested custom types", () => {
      jss.custom("N", {
        check: (key, val) => val && val.isNested === true,
        encode: (path, key, val) => ({ wrapped: val.value }),
        decode: (val) => ({ isNested: true, value: val.wrapped }),
      });

      const input = {
        level1: {
          level2: {
            isNested: true,
            value: "deep",
          },
        },
      };

      const result = jss.parse(jss.stringify(input));
      expect(result.level1.level2.isNested).toBe(true);
      expect(result.level1.level2.value).toBe("deep");
    });

    test("handles arrays of custom types", () => {
      jss.custom("A", {
        check: (key, val) => val && val.isCustomArray === true,
        encode: (path, key, val) => val.items,
        decode: (val) => ({ isCustomArray: true, items: val }),
      });

      const input = {
        list: [
          { isCustomArray: true, items: [1, 2, 3] },
          { isCustomArray: true, items: [4, 5, 6] },
        ],
      };

      const result = jss.parse(jss.stringify(input));
      expect(result.list[0].items).toEqual([1, 2, 3]);
      expect(result.list[1].items).toEqual([4, 5, 6]);
    });

    test("custom plugins do not interfere with built-in types", () => {
      jss.custom("X", {
        check: (key, val) => val && val.isCustom === true,
        encode: (path, key, val) => val.data,
        decode: (val) => ({ isCustom: true, data: val }),
      });

      const input = {
        date: new Date("2025-01-01"),
        regex: /test/gi,
        custom: { isCustom: true, data: "hello" },
        set: new Set([1, 2, 3]),
        map: new Map([["a", 1]]),
      };

      const result = jss.parse(jss.stringify(input));

      expect(result.date).toBeInstanceOf(Date);
      expect(result.regex).toBeInstanceOf(RegExp);
      expect(result.custom.isCustom).toBe(true);
      expect(result.custom.data).toBe("hello");
      expect(result.set).toBeInstanceOf(Set);
      expect(result.map).toBeInstanceOf(Map);
    });
  });

  describe("Check Function Behavior", () => {
    test("check receives key and value", () => {
      const checkCalls = [];

      jss.custom("T", {
        check: (key, val) => {
          checkCalls.push({ key, val });
          return val && val.track === true;
        },
        encode: (path, key, val) => val.data,
        decode: (val) => ({ track: true, data: val }),
      });

      jss.encode({
        normal: "value",
        tracked: { track: true, data: 42 },
      });

      // Check should have been called for both values
      expect(checkCalls.some((c) => c.key === "normal")).toBe(true);
      expect(checkCalls.some((c) => c.key === "tracked")).toBe(true);
    });

    test("first matching plugin wins", () => {
      jss.custom("F", {
        check: (key, val) => typeof val === "number" && val > 100,
        encode: (path, key, val) => `F:${val}`,
        decode: (val) => parseInt(val.slice(2)),
      });

      jss.custom("G", {
        check: (key, val) => typeof val === "number",
        encode: (path, key, val) => `G:${val}`,
        decode: (val) => parseInt(val.slice(2)),
      });

      const input = { big: 200, small: 50 };
      const encoded = jss.encode(input);

      // 200 should match F (first registered, specific condition)
      expect(encoded["big<!F>"]).toBe("F:200");
      // 50 should match G (second registered, general condition)
      expect(encoded["small<!G>"]).toBe("G:50");
    });
  });

  describe("Path Information", () => {
    test("encode receives correct path array", () => {
      const pathsReceived = [];

      jss.custom("Z", {
        check: (key, val) => val === "PATH_MARKER",
        encode: (path, key, val) => {
          pathsReceived.push([...path]);
          return val;
        },
        decode: (val) => val,
      });

      jss.encode({
        level1: {
          level2: {
            value: "PATH_MARKER",
          },
        },
        arr: ["PATH_MARKER"],
      });

      // Check paths were captured correctly
      expect(pathsReceived).toContainEqual(["level1", "level2", "value"]);
      expect(pathsReceived).toContainEqual(["arr", 0]);
    });
  });

  describe("clearPlugins", () => {
    test("removes all custom plugins", () => {
      jss.custom("A", {
        check: () => false,
        encode: () => {},
        decode: () => {},
      });
      jss.custom("B", {
        check: () => false,
        encode: () => {},
        decode: () => {},
      });

      expect(hasPlugin("A")).toBe(true);
      expect(hasPlugin("B")).toBe(true);

      clearPlugins();

      expect(hasPlugin("A")).toBe(false);
      expect(hasPlugin("B")).toBe(false);
    });

    test("allows re-registration after clear", () => {
      jss.custom("X", {
        check: () => false,
        encode: () => {},
        decode: () => {},
      });

      clearPlugins();

      // Should not throw
      jss.custom("X", {
        check: () => false,
        encode: () => {},
        decode: () => {},
      });

      expect(hasPlugin("X")).toBe(true);
    });
  });
});
