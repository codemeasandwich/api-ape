/**
 * @fileoverview Tests for the opt-in controller hot-reload helpers.
 *
 * Domain context: hot reload is a development convenience. When enabled, a
 * change under the controller directory (or under extra directories the app
 * lists, such as its service modules) must produce ONE coherent set of
 * controllers: every module under those roots is evicted from the module cache
 * and every controller is re-required, so no controller keeps a stale import.
 *
 * Technical context: Jest owns its own module registry, so the cache is a plain
 * object injected by the tests. Real `require.cache` behaviour is verified in a
 * Node child process (deepRequire.reload.test.js) and under Bun
 * (integration/bun/hot-reload.ts).
 */

const path = require("path");
const { EventEmitter } = require("events");
const {
  invalidateModules,
  restoreModules,
  SOURCE_EXTENSIONS,
  watchDirs,
  supportsRecursiveWatch,
  normaliseWatch,
} = require("./hotReload");

describe("normaliseWatch", () => {
  test("falsy means off", () => {
    expect(normaliseWatch(undefined, "/a")).toBeNull();
    expect(normaliseWatch(false, "/a")).toBeNull();
  });

  test("true watches only the controller directory with a 50ms debounce", () => {
    expect(normaliseWatch(true, "/a")).toEqual({ roots: ["/a"], debounceMs: 50 });
  });

  test("an object adds resolved extra paths and a custom debounce", () => {
    const n = normaliseWatch({ paths: ["/svc", "rel/dir"], debounceMs: 5 }, "/a");
    expect(n.roots).toEqual(["/a", "/svc", path.resolve("rel/dir")]);
    expect(n.debounceMs).toBe(5);
  });

  test("an object without paths or debounce uses the defaults", () => {
    expect(normaliseWatch({}, "/a")).toEqual({ roots: ["/a"], debounceMs: 50 });
  });

  test("roots are real paths, so a symlinked directory matches require.cache keys", () => {
    const fs = require("fs");
    const os = require("os");
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "hr-real-"));
    const real = path.join(base, "real");
    const link = path.join(base, "link");
    fs.mkdirSync(real);
    fs.symlinkSync(real, link);
    try {
      expect(normaliseWatch(true, link).roots).toEqual([fs.realpathSync(real)]);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test("duplicate roots are collapsed", () => {
    expect(normaliseWatch({ paths: ["/a", "/a/"] }, "/a").roots).toEqual(["/a"]);
  });

  test("a bad debounceMs is refused", () => {
    for (const bad of [NaN, -1, "50", Infinity]) {
      expect(() => normaliseWatch({ debounceMs: bad }, "/a")).toThrow(/debounceMs/);
    }
    expect(normaliseWatch({ debounceMs: 0 }, "/a").debounceMs).toBe(0);
  });

  test("source extensions cover TypeScript, so a .ts-only service edit reloads", () => {
    ["ts", "mts", "cts", "tsx", "jsx", "js", "cjs", "mjs", "json"].forEach((e) =>
      expect(SOURCE_EXTENSIONS).toContain(e),
    );
  });

  test("a non-array paths value is refused", () => {
    expect(() => normaliseWatch({ paths: "/svc" }, "/a")).toThrow(/watch\.paths/);
  });
});

describe("invalidateModules", () => {
  const sep = path.sep;

  test("evicts every cached module under a root, and only those", () => {
    const cache = {
      [`${sep}app${sep}api${sep}users.js`]: {},
      [`${sep}app${sep}api${sep}deep${sep}x.js`]: {},
      [`${sep}app${sep}svc${sep}db.js`]: {},
      [`${sep}app${sep}other${sep}y.js`]: {},
      [`${sep}app${sep}apix${sep}z.js`]: {},
    };
    const removed = invalidateModules([`${sep}app${sep}api`, `${sep}app${sep}svc`], cache);
    expect(removed).toBe(3);
    expect(Object.keys(cache).sort()).toEqual(
      [`${sep}app${sep}apix${sep}z.js`, `${sep}app${sep}other${sep}y.js`].sort(),
    );
  });

  test("never evicts node_modules, even under a root", () => {
    const keep = `${sep}app${sep}api${sep}node_modules${sep}lib${sep}i.js`;
    const cache = { [keep]: {}, [`${sep}app${sep}api${sep}a.js`]: {} };
    expect(invalidateModules([`${sep}app${sep}api`], cache)).toBe(1);
    expect(cache[keep]).toBeDefined();
  });

  test("never evicts api-ape's own modules, even if a watched root contains them", () => {
    const own = require.resolve("./hotReload");
    const cache = { [own]: {}, [`${sep}app${sep}api${sep}a.js`]: {} };
    expect(invalidateModules([path.dirname(path.dirname(own)), `${sep}app${sep}api`], cache)).toBe(1);
    expect(cache[own]).toBeDefined();
  });

  test("collects the evicted entries so a failed reload can be undone", () => {
    const a = { id: "old-a" };
    const cache = { [`${sep}r${sep}a.js`]: a, [`${sep}elsewhere${sep}b.js`]: { id: "b" } };
    const saved = new Map();
    invalidateModules([`${sep}r`], cache, saved);
    expect([...saved.keys()]).toEqual([`${sep}r${sep}a.js`]);
    // the failed load repopulated some entries under the root with half-new modules
    cache[`${sep}r${sep}a.js`] = { id: "new-a" };
    cache[`${sep}r${sep}c.js`] = { id: "new-c" };
    restoreModules([`${sep}r`], saved, cache);
    expect(cache[`${sep}r${sep}a.js`]).toBe(a);
    expect(cache[`${sep}r${sep}c.js`]).toBeUndefined();
    expect(cache[`${sep}elsewhere${sep}b.js`]).toEqual({ id: "b" });
  });

  test("restoreModules defaults to require.cache without throwing", () => {
    expect(() => restoreModules([`${sep}definitely${sep}not${sep}loaded`], new Map())).not.toThrow();
  });

  test("defaults to require.cache (an object) without throwing", () => {
    expect(typeof invalidateModules([`${sep}definitely${sep}not${sep}loaded`])).toBe("number");
  });
});

describe("supportsRecursiveWatch", () => {
  test.each([
    ["darwin", 18, true],
    ["win32", 18, true],
    ["linux", 20, true],
    ["linux", 18, false],
    ["freebsd", 22, false],
  ])("%s node %i -> %s", (platform, major, expected) => {
    expect(supportsRecursiveWatch(platform, `${major}.1.0`)).toBe(expected);
  });

  test("defaults to the running process", () => {
    expect(typeof supportsRecursiveWatch()).toBe("boolean");
  });
});

describe("watchDirs", () => {
  jest.useFakeTimers();

  function harness(extra = {}) {
    const watchers = [];
    const watch = jest.fn((root, opts, cb) => {
      const w = new EventEmitter();
      w.close = jest.fn();
      w.unref = jest.fn();
      w.root = root;
      w.cb = cb;
      watchers.push(w);
      return w;
    });
    const onChange = jest.fn();
    const warn = jest.fn();
    const handle = watchDirs({
      roots: ["/a", "/b"],
      extensions: ["js", "ts"],
      debounceMs: 40,
      onChange,
      watch,
      supported: true,
      warn,
      ...extra,
    });
    return { watchers, watch, onChange, warn, handle };
  }

  afterEach(() => jest.clearAllTimers());

  test("opens one recursive watcher per root and unrefs it", () => {
    const { watchers, watch } = harness();
    expect(watch).toHaveBeenCalledTimes(2);
    expect(watch.mock.calls[0][1]).toEqual({ recursive: true });
    expect(watchers.map((w) => w.root)).toEqual(["/a", "/b"]);
    watchers.forEach((w) => expect(w.unref).toHaveBeenCalled());
  });

  test("a burst of events becomes a single debounced onChange listing the files", () => {
    const { watchers, onChange } = harness();
    watchers[0].cb("change", "users.js");
    watchers[0].cb("change", "users.js");
    watchers[1].cb("rename", path.join("deep", "db.ts"));
    expect(onChange).not.toHaveBeenCalled();
    jest.advanceTimersByTime(40);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].sort()).toEqual(
      [path.join("/a", "users.js"), path.join("/b", "deep", "db.ts")].sort(),
    );
    watchers[0].cb("change", "users.js");
    jest.advanceTimersByTime(40);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  test("ignores files with other extensions, node_modules and dot-directories", () => {
    const { watchers, onChange } = harness();
    watchers[0].cb("change", "README.md");
    watchers[0].cb("change", path.join("node_modules", "x", "i.js"));
    watchers[0].cb("change", path.join(".git", "HEAD.js"));
    jest.advanceTimersByTime(100);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("a null filename still triggers a reload (the changed entry is unknown)", () => {
    const { watchers, onChange } = harness();
    watchers[0].cb("rename", null);
    jest.advanceTimersByTime(40);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  test("close() stops the watchers and cancels a pending reload", () => {
    const { watchers, onChange, handle } = harness();
    watchers[0].cb("change", "users.js");
    handle.close();
    jest.advanceTimersByTime(100);
    expect(onChange).not.toHaveBeenCalled();
    watchers.forEach((w) => expect(w.close).toHaveBeenCalled());
    handle.close(); // idempotent
  });

  test("close() with no pending reload and a watcher that already closed is safe", () => {
    const { watchers, handle } = harness();
    watchers[0].close.mockImplementation(() => {
      throw new Error("already closed");
    });
    expect(() => handle.close()).not.toThrow();
  });

  test("an unsupported platform warns once and watches nothing", () => {
    const { watch, warn, handle } = harness({ supported: false });
    expect(watch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/recursive/);
    expect(() => handle.close()).not.toThrow();
  });

  test("an fs.watch that throws (missing directory) is reported, others keep working", () => {
    const ok = [];
    const watch = jest.fn((root) => {
      if (root === "/a") throw new Error("ENOENT");
      const w = new EventEmitter();
      w.close = jest.fn();
      ok.push(w);
      return w;
    });
    const warn = jest.fn();
    const handle = watchDirs({
      roots: ["/a", "/b"],
      extensions: ["js"],
      debounceMs: 1,
      onChange: () => {},
      watch,
      supported: true,
      warn,
    });
    expect(warn.mock.calls[0][0]).toMatch(/\/a.*ENOENT/);
    expect(ok).toHaveLength(1);
    handle.close();
    expect(ok[0].close).toHaveBeenCalled();
  });

  test("watcher error events are reported through warn", () => {
    const { watchers, warn } = harness();
    watchers[0].emit("error", new Error("EMFILE"));
    expect(warn.mock.calls.pop()[0]).toMatch(/EMFILE/);
  });

  test("the default warning sink is the api-ape logger", () => {
    const logger = require("../../utils/apeLogger");
    const warn = jest.fn();
    logger.configureApeLogging({ warn, log() {}, error() {}, info() {}, debug() {} });
    try {
      watchDirs({ roots: ["/a"], extensions: ["js"], debounceMs: 1, onChange: () => {}, supported: false });
      expect(warn).toHaveBeenCalled();
    } finally {
      logger.resetApeLoggingForTesting();
    }
  });

  test("defaults: real fs.watch, platform detection and the api-ape logger", () => {
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hr-default-"));
    const handle = watchDirs({ roots: [dir], extensions: ["js"], debounceMs: 1, onChange: () => {} });
    handle.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
