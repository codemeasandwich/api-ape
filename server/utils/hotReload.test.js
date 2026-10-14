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
    expect(normaliseWatch(true, "/a")).toEqual({ roots: ["/a"], debounceMs: 50, recursive: undefined });
  });

  test("an object adds resolved extra paths and a custom debounce", () => {
    const n = normaliseWatch({ paths: ["/svc", "rel/dir"], debounceMs: 5 }, "/a");
    expect(n.roots).toEqual(["/a", "/svc", path.resolve("rel/dir")]);
    expect(n.debounceMs).toBe(5);
  });

  test("an object without paths or debounce uses the defaults", () => {
    expect(normaliseWatch({}, "/a")).toEqual({ roots: ["/a"], debounceMs: 50, recursive: undefined });
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

  test("recursive can be forced off; otherwise it is left to platform detection", () => {
    expect(normaliseWatch({ recursive: false }, "/a").recursive).toBe(false);
    expect(normaliseWatch(true, "/a").recursive).toBeUndefined();
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

describe("watchDirs — single recursive watcher", () => {
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
      recursive: true,
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

  test("close() tolerates a watcher that already closed", () => {
    const { watchers, handle } = harness();
    watchers[0].close.mockImplementation(() => {
      throw new Error("already closed");
    });
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
      recursive: true,
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
      watchDirs({
        roots: ["/a"],
        extensions: ["js"],
        debounceMs: 1,
        onChange: () => {},
        recursive: true,
        watch: () => {
          throw new Error("boom");
        },
      });
      expect(warn).toHaveBeenCalled();
    } finally {
      logger.resetApeLoggingForTesting();
    }
  });

  test("defaults: real fs.watch and platform detection", () => {
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hr-default-"));
    const handle = watchDirs({ roots: [dir], extensions: ["js"], debounceMs: 1, onChange: () => {} });
    handle.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("watchDirs — per-directory fallback (no recursive fs.watch)", () => {
  const fs = require("fs");
  const os = require("os");
  jest.useFakeTimers();

  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hr-tree-"));
    fs.mkdirSync(path.join(root, "a", "deep"), { recursive: true });
    fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
    fs.mkdirSync(path.join(root, ".git"));
    fs.writeFileSync(path.join(root, "top.js"), "");
  });
  afterEach(() => {
    jest.clearAllTimers();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function open(extra = {}) {
    const watchers = [];
    const watch = jest.fn((dir, opts, cb) => {
      const w = new EventEmitter();
      w.close = jest.fn();
      w.unref = jest.fn();
      w.dir = dir;
      w.cb = cb;
      watchers.push(w);
      return w;
    });
    const onChange = jest.fn();
    const warn = jest.fn();
    const handle = watchDirs({
      roots: [root],
      extensions: ["js"],
      debounceMs: 10,
      onChange,
      watch,
      recursive: false,
      warn,
      ...extra,
    });
    return { watchers, watch, onChange, warn, handle, byDir: (d) => watchers.find((w) => w.dir === d) };
  }

  test("one non-recursive watcher per directory, skipping node_modules and dot-directories", () => {
    const { watchers, watch } = open();
    expect(watchers.map((w) => w.dir).sort()).toEqual(
      [root, path.join(root, "a"), path.join(root, "a", "deep")].sort(),
    );
    watch.mock.calls.forEach((c) => expect(c[1]).toEqual({}));
    watchers.forEach((w) => expect(w.unref).toHaveBeenCalled());
  });

  test("an event in a nested directory is reported with its path under the root", () => {
    const { byDir, onChange } = open();
    byDir(path.join(root, "a", "deep")).cb("change", "x.js");
    jest.advanceTimersByTime(10);
    expect(onChange).toHaveBeenCalledWith([path.join(root, "a", "deep", "x.js")]);
  });

  test("irrelevant files, and events with no filename in a directory, behave like the recursive mode", () => {
    const { byDir, onChange } = open();
    byDir(root).cb("change", "notes.md");
    jest.advanceTimersByTime(10);
    expect(onChange).not.toHaveBeenCalled();
    byDir(root).cb("rename", null);
    jest.advanceTimersByTime(10);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  test("a directory created while running gets its own watcher and triggers one reload", () => {
    const { byDir, watchers, onChange } = open();
    fs.mkdirSync(path.join(root, "fresh", "inner"), { recursive: true });
    byDir(root).cb("rename", "fresh");
    jest.advanceTimersByTime(10);
    expect(watchers.map((w) => w.dir)).toEqual(
      expect.arrayContaining([path.join(root, "fresh"), path.join(root, "fresh", "inner")]),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    // the same directory is not watched twice
    byDir(root).cb("rename", "fresh");
    expect(watchers.filter((w) => w.dir === path.join(root, "fresh"))).toHaveLength(1);
  });

  test("a new node_modules or dot-directory is ignored", () => {
    const { byDir, watchers, onChange } = open();
    fs.mkdirSync(path.join(root, "a", "node_modules"));
    fs.mkdirSync(path.join(root, "a", ".cache"));
    const before = watchers.length;
    byDir(path.join(root, "a")).cb("rename", "node_modules");
    byDir(path.join(root, "a")).cb("rename", ".cache");
    jest.advanceTimersByTime(10);
    expect(watchers).toHaveLength(before);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("an event for a path that vanished is treated as a file event", () => {
    const { byDir, onChange } = open();
    byDir(root).cb("rename", "gone.js");
    jest.advanceTimersByTime(10);
    expect(onChange).toHaveBeenCalledWith([path.join(root, "gone.js")]);
  });

  test("a directory that cannot be watched is reported and the rest keep working", () => {
    const opened = [];
    const { warn } = open({
      watch: jest.fn((dir) => {
        if (dir.endsWith(`${path.sep}deep`)) throw new Error("ENOSPC");
        const w = new EventEmitter();
        w.close = jest.fn();
        opened.push(w);
        return w;
      }),
    });
    expect(warn.mock.calls[0][0]).toMatch(/deep.*ENOSPC/);
    expect(opened).toHaveLength(2);
  });

  test("watcher errors are reported and close() closes every directory watcher", () => {
    const { watchers, warn, handle } = open();
    watchers[0].emit("error", new Error("EMFILE"));
    expect(warn.mock.calls.pop()[0]).toMatch(/EMFILE/);
    handle.close();
    watchers.forEach((w) => expect(w.close).toHaveBeenCalled());
  });

  test("without an explicit choice the platform decides", () => {
    const watch = jest.fn(() => {
      const w = new EventEmitter();
      w.close = jest.fn();
      return w;
    });
    const real = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const versions = process.versions;
    Object.defineProperty(process, "versions", { value: { ...versions, node: "18.0.0" }, configurable: true });
    try {
      watchDirs({ roots: [root], extensions: ["js"], debounceMs: 1, onChange() {}, watch });
    } finally {
      Object.defineProperty(process, "platform", { value: real, configurable: true });
      Object.defineProperty(process, "versions", { value: versions, configurable: true });
    }
    // Linux on Node 18: per-directory mode, so root + a + a/deep
    expect(watch).toHaveBeenCalledTimes(3);
  });
});
