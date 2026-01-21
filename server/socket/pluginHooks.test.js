/**
 * @fileoverview Tests for Plugin Hooks
 *
 * Tests the JSS plugin lifecycle hooks for server-side processing.
 */

const {
  processPluginSend,
  processPluginReceive,
  findPluginTags,
  cleanPluginTags,
  setValueAtPath,
} = require("./pluginHooks");

const { clearPlugins, register, getAllPlugins } = require("../../utils/jss/plugins");

describe("Plugin Hooks", () => {
  beforeEach(() => {
    clearPlugins();
  });

  describe("processPluginSend", () => {
    test("returns null data unchanged", () => {
      const result = processPluginSend(null, {});
      expect(result.data).toBeNull();
      expect(result.cleanups).toEqual([]);
      expect(result.binaryCount).toBe(0);
    });

    test("returns undefined data unchanged", () => {
      const result = processPluginSend(undefined, {});
      expect(result.data).toBeUndefined();
      expect(result.cleanups).toEqual([]);
      expect(result.binaryCount).toBe(0);
    });

    test("passes through Date unchanged", () => {
      const date = new Date();
      const result = processPluginSend(date, {});
      expect(result.data).toBe(date);
    });

    test("passes through RegExp unchanged", () => {
      const regex = /test/gi;
      const result = processPluginSend(regex, {});
      expect(result.data).toBe(regex);
    });

    test("passes through Map unchanged", () => {
      const map = new Map([["a", 1]]);
      const result = processPluginSend(map, {});
      expect(result.data).toBe(map);
    });

    test("passes through Set unchanged", () => {
      const set = new Set([1, 2, 3]);
      const result = processPluginSend(set, {});
      expect(result.data).toBe(set);
    });

    test("passes through Error unchanged", () => {
      const error = new Error("test");
      const result = processPluginSend(error, {});
      expect(result.data).toBe(error);
    });

    test("passes through primitive string unchanged", () => {
      const result = processPluginSend("hello", {});
      expect(result.data).toBe("hello");
    });

    test("passes through primitive number unchanged", () => {
      const result = processPluginSend(42, {});
      expect(result.data).toBe(42);
    });

    test("passes through boolean unchanged", () => {
      const result = processPluginSend(true, {});
      expect(result.data).toBe(true);
    });

    test("processes array elements recursively", () => {
      const result = processPluginSend([{ a: 1 }, { b: 2 }], {});
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.data[0]).toEqual({ a: 1 });
    });

    test("passes through F-tagged values unchanged", () => {
      const data = { "share<!F>": "hash123", name: "file.pdf" };
      const result = processPluginSend(data, {});
      expect(result.data["share<!F>"]).toBe("hash123");
      expect(result.data.name).toBe("file.pdf");
    });

    test("processes plugin with onSend hook", () => {
      register("X", {
        check: (key, value) => typeof value === "object" && value.isSpecial,
        encode: (path, key, value, context) => "encoded",
        decode: (value) => value,
        onSend: (path, key, value, context) => {
          return { replace: "replaced-value" };
        },
      });

      const result = processPluginSend(
        { special: { isSpecial: true, data: "test" } },
        { queryId: "q1", clientId: "c1" }
      );

      expect(result.data["special<!X>"]).toBe("replaced-value");
      expect(result.binaryCount).toBe(1);
    });

    test("plugin onSend with cleanup callback", () => {
      const cleanupFn = jest.fn();

      register("Y", {
        check: (key, value) => value.needsCleanup === true,
        encode: () => "encoded",
        decode: (value) => value,
        onSend: () => {
          return { replace: "data", cleanup: cleanupFn };
        },
      });

      const result = processPluginSend(
        { item: { needsCleanup: true } },
        {}
      );

      expect(result.cleanups.length).toBe(1);
      result.cleanups[0]();
      expect(cleanupFn).toHaveBeenCalled();
    });

    test("plugin matched without onSend returns data unchanged", () => {
      register("Z", {
        check: (key, value) => value.tagged === true,
        encode: () => "encoded",
        decode: (value) => value,
        // No onSend hook
      });

      const result = processPluginSend(
        { item: { tagged: true } },
        {}
      );

      // Value should be passed through since no onSend
      expect(result.data.item).toEqual({ tagged: true });
      expect(result.binaryCount).toBe(0);
    });

    test("processes nested objects recursively", () => {
      const result = processPluginSend(
        {
          level1: {
            level2: {
              value: "deep",
            },
          },
        },
        {}
      );

      expect(result.data.level1.level2.value).toBe("deep");
    });

    test("accumulates binary counts from nested structures", () => {
      register("B", {
        check: (key, value) => value.isBinary === true,
        encode: () => "pending",
        decode: (value) => value,
        onSend: () => ({ replace: "hash" }),
      });

      const result = processPluginSend(
        {
          files: [
            { isBinary: true },
            { isBinary: true },
          ],
        },
        {}
      );

      expect(result.binaryCount).toBe(2);
    });
  });

  describe("findPluginTags", () => {
    test("returns empty array for null", () => {
      expect(findPluginTags(null)).toEqual([]);
    });

    test("returns empty array for undefined", () => {
      expect(findPluginTags(undefined)).toEqual([]);
    });

    test("returns empty array for non-object", () => {
      expect(findPluginTags("string")).toEqual([]);
      expect(findPluginTags(42)).toEqual([]);
    });

    test("finds B tag at root level", () => {
      const tags = findPluginTags({ "file<!B>": "hash123" });

      expect(tags.length).toBe(1);
      expect(tags[0]).toEqual({
        path: "file",
        tag: "B",
        hash: "hash123",
        originalKey: "file<!B>",
      });
    });

    test("finds A tag at root level", () => {
      const tags = findPluginTags({ "data<!A>": "hash456" });

      expect(tags.length).toBe(1);
      expect(tags[0].tag).toBe("A");
    });

    test("finds L tag at root level", () => {
      const tags = findPluginTags({ "image<!L>": "hash789" });

      expect(tags.length).toBe(1);
      expect(tags[0].tag).toBe("L");
    });

    test("finds multiple tags at same level", () => {
      const tags = findPluginTags({
        "file1<!B>": "h1",
        "file2<!B>": "h2",
        name: "test",
      });

      expect(tags.length).toBe(2);
    });

    test("finds tags in nested objects", () => {
      const tags = findPluginTags({
        user: {
          profile: {
            "avatar<!B>": "avatar-hash",
          },
        },
      });

      expect(tags.length).toBe(1);
      expect(tags[0].path).toBe("user.profile.avatar");
    });

    test("finds tags in arrays", () => {
      const tags = findPluginTags({
        attachments: [
          { "file<!B>": "h1" },
          { "file<!B>": "h2" },
        ],
      });

      expect(tags.length).toBe(2);
      expect(tags[0].path).toBe("attachments.0.file");
      expect(tags[1].path).toBe("attachments.1.file");
    });

    test("recurses into array elements", () => {
      const tags = findPluginTags([
        { "data<!A>": "h1" },
        { nested: { "data<!A>": "h2" } },
      ]);

      expect(tags.length).toBe(2);
      expect(tags[0].path).toBe("0.data");
      expect(tags[1].path).toBe("1.nested.data");
    });

    test("recurses into non-tagged object values", () => {
      const tags = findPluginTags({
        wrapper: {
          inner: {
            "content<!B>": "hash",
          },
        },
      });

      expect(tags.length).toBe(1);
      expect(tags[0].path).toBe("wrapper.inner.content");
    });
  });

  describe("cleanPluginTags", () => {
    test("returns null unchanged", () => {
      expect(cleanPluginTags(null)).toBeNull();
    });

    test("returns undefined unchanged", () => {
      expect(cleanPluginTags(undefined)).toBeUndefined();
    });

    test("returns primitives unchanged", () => {
      expect(cleanPluginTags("string")).toBe("string");
      expect(cleanPluginTags(42)).toBe(42);
      expect(cleanPluginTags(true)).toBe(true);
    });

    test("removes B tag from key", () => {
      const cleaned = cleanPluginTags({ "file<!B>": "hash123" });
      expect(cleaned).toEqual({ file: "hash123" });
    });

    test("removes A tag from key", () => {
      const cleaned = cleanPluginTags({ "data<!A>": "hash456" });
      expect(cleaned).toEqual({ data: "hash456" });
    });

    test("cleans multiple tagged keys", () => {
      const cleaned = cleanPluginTags({
        "file1<!B>": "h1",
        "file2<!A>": "h2",
        name: "test",
      });

      expect(cleaned).toEqual({
        file1: "h1",
        file2: "h2",
        name: "test",
      });
    });

    test("cleans nested objects recursively", () => {
      const cleaned = cleanPluginTags({
        user: {
          "avatar<!B>": "hash",
          name: "Alice",
        },
      });

      expect(cleaned).toEqual({
        user: {
          avatar: "hash",
          name: "Alice",
        },
      });
    });

    test("cleans arrays recursively", () => {
      const cleaned = cleanPluginTags([
        { "file<!B>": "h1" },
        { "file<!B>": "h2" },
      ]);

      expect(cleaned).toEqual([
        { file: "h1" },
        { file: "h2" },
      ]);
    });
  });

  describe("setValueAtPath", () => {
    test("sets value at simple path", () => {
      const obj = { file: "hash" };
      setValueAtPath(obj, "file", Buffer.from("data"));

      expect(Buffer.isBuffer(obj.file)).toBe(true);
    });

    test("sets value at nested path", () => {
      const obj = { user: { profile: { avatar: "hash" } } };
      setValueAtPath(obj, "user.profile.avatar", Buffer.from("image"));

      expect(Buffer.isBuffer(obj.user.profile.avatar)).toBe(true);
    });

    test("sets value at array index path", () => {
      const obj = { files: [{ data: "h1" }, { data: "h2" }] };
      setValueAtPath(obj, "files.0.data", Buffer.from("content1"));

      expect(Buffer.isBuffer(obj.files[0].data)).toBe(true);
      expect(obj.files[1].data).toBe("h2");
    });

    test("sets value at deeply nested path", () => {
      const obj = { a: { b: { c: { d: "value" } } } };
      setValueAtPath(obj, "a.b.c.d", "replaced");

      expect(obj.a.b.c.d).toBe("replaced");
    });
  });

  describe("processPluginReceive", () => {
    test("returns data unchanged when no tags found", async () => {
      const data = { name: "test", value: 42 };
      const result = await processPluginReceive(data, data, {});

      expect(result).toEqual(data);
    });

    test("processes plugin tags with onReceive", async () => {
      register("T", {
        check: () => false,
        encode: (v) => v,
        decode: (v) => v,
        onReceive: async (path, key, hash, context) => {
          return `resolved-${hash}`;
        },
      });

      const rawData = { "field<!T>": "hash123" };
      const decodedData = { field: "hash123" };

      const result = await processPluginReceive(decodedData, rawData, {});

      expect(result.field).toBe("resolved-hash123");
    });

    test("processes multiple tags in parallel", async () => {
      register("Q", {
        check: () => false,
        encode: (v) => v,
        decode: (v) => v,
        onReceive: async (path, key, hash) => {
          return `data-${hash}`;
        },
      });

      const rawData = {
        "first<!Q>": "h1",
        "second<!Q>": "h2",
      };
      const decodedData = { first: "h1", second: "h2" };

      const result = await processPluginReceive(decodedData, rawData, {});

      expect(result.first).toBe("data-h1");
      expect(result.second).toBe("data-h2");
    });

    test("handles nested tags", async () => {
      register("N", {
        check: () => false,
        encode: (v) => v,
        decode: (v) => v,
        onReceive: async (path, key, hash) => `nested-${hash}`,
      });

      const rawData = {
        wrapper: {
          "data<!N>": "deep-hash",
        },
      };
      const decodedData = { wrapper: { data: "deep-hash" } };

      const result = await processPluginReceive(decodedData, rawData, {});

      expect(result.wrapper.data).toBe("nested-deep-hash");
    });

    test("skips tags without onReceive handler", async () => {
      register("W", {
        check: () => false,
        encode: (v) => v,
        decode: (v) => v,
        // No onReceive
      });

      const rawData = { "field<!W>": "hash" };
      const decodedData = { field: "hash" };

      const result = await processPluginReceive(decodedData, rawData, {});

      // Value should be cleaned but not resolved (no onReceive)
      expect(result.field).toBe("hash");
    });

    test("skips unknown plugin tags", async () => {
      // No plugin registered for 'U'
      const rawData = { "field<!U>": "hash" };
      const decodedData = { field: "hash" };

      const result = await processPluginReceive(decodedData, rawData, {});

      expect(result.field).toBe("hash");
    });
  });
});
