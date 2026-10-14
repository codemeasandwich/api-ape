/**
 * @fileoverview Tests for deepRequire convention-based controller loader.
 *
 * Each test creates a temporary directory of controllers, calls deepRequire,
 * and verifies the endpoint→module map. The hot-reload tests (opt-in `watch`)
 * mutate files after the initial load and emit watch events directly.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const deepRequire = require("./deepRequire");

/** Create a tmpdir with the given file tree, return its absolute path. */
function tmpDir(tree) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deep-require-"));
  for (const [rel, content] of Object.entries(tree)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
  return root;
}

/** Best-effort cleanup of the tmp directory. */
function cleanup(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe("deepRequire — endpoint mapping", () => {
  // Scenario: a typical api directory with a flat list of controllers.
  test("loads flat controller files into endpoint keys", () => {
    const root = tmpDir({
      "users.js": "module.exports = () => 'users';",
      "posts.js": "module.exports = () => 'posts';",
    });
    try {
      const packages = deepRequire(root);
      expect(packages.users).toBeDefined();
      expect(packages.users()).toBe("users");
      expect(packages.posts()).toBeDefined();
    } finally {
      cleanup(root);
    }
  });

  // Scenario: index.js inside a subdirectory maps to the parent directory.
  test("subdir/index.js maps to subdir endpoint", () => {
    const root = tmpDir({
      "users/index.js": "module.exports = () => 'users-index';",
      "users/list.js": "module.exports = () => 'users-list';",
    });
    try {
      const packages = deepRequire(root);
      expect(packages.users).toBeDefined();
      expect(packages.users()).toBe("users-index");
      expect(packages["users/list"]()).toBe("users-list");
    } finally {
      cleanup(root);
    }
  });

  // Scenario: root /index.js is skipped (returns null endpoint) per
  // convention — used for re-exports or framework setup.
  test("root /index.js is excluded from packages", () => {
    const root = tmpDir({
      "index.js": "module.exports = () => 'root';",
      "users.js": "module.exports = () => 'users';",
    });
    try {
      const packages = deepRequire(root);
      expect(packages.users).toBeDefined();
      expect(packages[""]).toBeUndefined();
      expect(packages.index).toBeUndefined();
    } finally {
      cleanup(root);
    }
  });

  // Scenario: underscore-prefixed files/directories are private and must
  // not be loaded as endpoints.
  test("underscore-prefixed files are skipped", () => {
    const root = tmpDir({
      "users.js": "module.exports = () => 'users';",
      "_helpers.js": "module.exports = () => 'private';",
      "_shared/util.js": "module.exports = () => 'private-util';",
    });
    try {
      const packages = deepRequire(root);
      expect(packages.users).toBeDefined();
      expect(packages._helpers).toBeUndefined();
      expect(packages["_shared/util"]).toBeUndefined();
    } finally {
      cleanup(root);
    }
  });

  // Scenario: ts files alongside js files when caller passes both extensions.
  test("accepts custom extension selector", () => {
    const root = tmpDir({
      "users.js": "module.exports = () => 'users';",
      "posts.ts": "module.exports = () => 'posts';",
    });
    try {
      const packages = deepRequire(root, ["js", "ts"]);
      expect(packages.users).toBeDefined();
      expect(packages.posts).toBeDefined();
    } finally {
      cleanup(root);
    }
  });

  // Scenario: deep nested structure.
  test("loads nested directory trees", () => {
    const root = tmpDir({
      "a/b/c/leaf.js": "module.exports = () => 'leaf';",
    });
    try {
      const packages = deepRequire(root);
      expect(packages["a/b/c/leaf"]()).toBe("leaf");
    } finally {
      cleanup(root);
    }
  });

  // Scenario: a directory contains non-controller files alongside the JS
  // ones (e.g. README.md, fixture JSON, type files). The directory walker's
  // `isFile && matching-extension` check must skip them.
  test("non-matching-extension files are not loaded as endpoints", () => {
    const root = tmpDir({
      "users.js": "module.exports = () => 'users';",
      "README.md": "# api docs",
      "fixtures.json": '{"x":1}',
    });
    try {
      const packages = deepRequire(root);
      expect(packages.users).toBeDefined();
      expect(packages.README).toBeUndefined();
      expect(packages.fixtures).toBeUndefined();
    } finally {
      cleanup(root);
    }
  });
});

// ============================================================================
// Hot reload is OPT-IN (`options.watch`). These tests spy on `fs.watch` to
// capture each watcher so it can be closed (otherwise jest would hang), and
// emit watch events directly to avoid platform fs.watch timing flakes.
//
// Jest owns its module registry and ignores `delete require.cache[...]`, so the
// tests use `jest.resetModules()` as the stand-in for cache eviction. True
// `require.cache` semantics (including the stale-import problem this feature
// fixes) are proven in a real Node process by deepRequire.reload.test.js and
// under Bun by integration/bun/hot-reload.ts.
// ============================================================================
describe("deepRequire — opt-in hot reload", () => {
  const openWatchers = [];
  let watchSpy;
  const logger = require("../../utils/apeLogger");
  const errors = [];
  const logs = [];

  beforeAll(() => {
    const realWatch = fs.watch.bind(fs);
    watchSpy = jest.spyOn(fs, "watch").mockImplementation((...args) => {
      const w = realWatch(...args);
      openWatchers.push(w);
      return w;
    });
    logger.configureApeLogging({
      error: (m) => errors.push(m),
      log: (m) => logs.push(m),
      warn() {},
      info() {},
      debug() {},
    });
  });

  // Every watched map is stopped after its test so a late debounce timer from
  // one test cannot reload (and log into) the next.
  const watchedMaps = [];
  function load(root, options, selector) {
    const packages = deepRequire(root, selector, options);
    watchedMaps.push(packages);
    return packages;
  }

  beforeEach(() => watchSpy.mockClear());

  afterEach(() => {
    watchedMaps.splice(0).forEach((m) => deepRequire.stopWatching(m));
    openWatchers.splice(0).forEach((w) => {
      try { w.close(); } catch { /* already closed */ }
    });
    errors.length = 0;
    logs.length = 0;
  });

  afterAll(() => {
    watchSpy.mockRestore();
    logger.resetApeLoggingForTesting();
  });

  async function waitFor(cond, timeoutMs = 1500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (cond()) return true;
      await new Promise((r) => setTimeout(r, 10));
    }
    return false;
  }

  const fire = (file, type = "change") => openWatchers[0].emit("change", type, file);

  // Scenario: nobody asked for hot reload. Nothing may watch the filesystem,
  // in production in particular.
  test("default: no watcher is created", () => {
    const root = tmpDir({ "users.js": "module.exports = () => 'v1';" });
    try {
      deepRequire(root);
      deepRequire(root, ["js"], {});
      deepRequire(root, ["js"], { watch: false });
      expect(watchSpy).not.toHaveBeenCalled();
    } finally {
      cleanup(root);
    }
  });

  // Scenario: `watch: true` watches the controller directory recursively.
  test("watch:true opens one recursive watcher on the controller directory", () => {
    const root = tmpDir({ "users.js": "module.exports = () => 'v1';" });
    try {
      const packages = load(root, { watch: true });
      expect(watchSpy).toHaveBeenCalledTimes(1);
      expect(watchSpy.mock.calls[0][0]).toBe(fs.realpathSync(root));
      expect(watchSpy.mock.calls[0][1]).toEqual({ recursive: true });
      deepRequire.stopWatching(packages);
    } finally {
      watchSpy.mockClear();
      cleanup(root);
    }
  });

  // Scenario: a controller is added while the server runs.
  test("a new controller is hot-loaded", async () => {
    const root = tmpDir({ "users.js": "module.exports = () => 'v1';" });
    try {
      const packages = load(root, { watch: { debounceMs: 1 } });
      fs.mkdirSync(path.join(root, "new"), { recursive: true });
      fs.writeFileSync(path.join(root, "new/route.js"), "module.exports = () => 'new-hot';");
      fire(path.join("new", "route.js"), "rename");
      expect(await waitFor(() => packages["new/route"])).toBeTruthy();
      expect(packages["new/route"]()).toBe("new-hot");
      expect(logs.join("\n")).toMatch(/Reloaded 2 controllers \(changed: new[\\/]route.js\)/);
    } finally {
      cleanup(root);
    }
  }, 10000);

  // Scenario: an existing controller is edited. All controllers are reloaded
  // together (the stand-in for cache eviction is jest.resetModules).
  test("an edited controller is swapped in place; the map identity is stable", async () => {
    const root = tmpDir({
      "a.js": "module.exports = () => 'a1';",
      "b.js": "module.exports = () => 'b1';",
    });
    try {
      const packages = load(root, { watch: { debounceMs: 1 } });
      const held = packages;
      fs.writeFileSync(path.join(root, "a.js"), "module.exports = () => 'a2';");
      fs.writeFileSync(path.join(root, "b.js"), "module.exports = () => 'b2';");
      jest.resetModules();
      fire("a.js");
      expect(await waitFor(() => packages.a() === "a2")).toBe(true);
      expect(held.b()).toBe("b2");
      expect(packages).toBe(held);
    } finally {
      cleanup(root);
    }
  }, 10000);

  // Scenario: a controller file is deleted. Unlike the old watcher, its
  // endpoint is removed from the map.
  test("a deleted controller's endpoint is removed", async () => {
    const root = tmpDir({
      "keep.js": "module.exports = () => 'keep';",
      "drop.js": "module.exports = () => 'drop';",
    });
    try {
      const packages = load(root, { watch: { debounceMs: 1 } });
      fs.unlinkSync(path.join(root, "drop.js"));
      jest.resetModules();
      fire("drop.js", "rename");
      expect(await waitFor(() => packages.drop === undefined)).toBe(true);
      expect(packages.keep()).toBe("keep");
    } finally {
      cleanup(root);
    }
  }, 10000);

  // Scenario: the developer saves a half-typed file. The previous controllers
  // must keep serving and the error must be reported, not thrown.
  test("a controller that fails to load keeps the previous set and logs the error", async () => {
    const root = tmpDir({ "a.js": "module.exports = () => 'a1';" });
    try {
      const packages = load(root, { watch: { debounceMs: 1 } });
      fs.writeFileSync(path.join(root, "a.js"), "module.exports = () => {");
      jest.resetModules();
      fire("a.js");
      expect(await waitFor(() => errors.length > 0)).toBe(true);
      expect(errors[0]).toMatch(/Reload failed, still serving the previous controllers/);
      expect(packages.a()).toBe("a1");
    } finally {
      cleanup(root);
    }
  }, 10000);

  // Scenario: a duplicate endpoint appears mid-session (users.js and
  // users/index.js). Same protection as a failed load.
  test("a duplicate endpoint on reload keeps the previous set", async () => {
    const root = tmpDir({ "users.js": "module.exports = () => 'u1';" });
    try {
      const packages = load(root, { watch: { debounceMs: 1 } });
      fs.mkdirSync(path.join(root, "users"));
      fs.writeFileSync(path.join(root, "users/index.js"), "module.exports = () => 'dup';");
      jest.resetModules();
      fire(path.join("users", "index.js"), "rename");
      expect(await waitFor(() => errors.length > 0)).toBe(true);
      expect(errors[0]).toMatch(/Duplicate endpoint/);
      expect(packages.users()).toBe("u1");
    } finally {
      cleanup(root);
    }
  }, 10000);

  // Scenario: initial load also refuses a duplicate endpoint, loudly.
  test("startup refuses duplicate endpoints", () => {
    const root = tmpDir({
      "users.js": "module.exports = () => 1;",
      "users/index.js": "module.exports = () => 2;",
    });
    try {
      expect(() => deepRequire(root)).toThrow(/Duplicate endpoint detected: "users"/);
    } finally {
      cleanup(root);
    }
  });

  // Scenario: edits to non-source files and private files do not reload.
  // Scenario: only a TypeScript service file changes (the controllers are .js).
  // The watcher must still reload; the extension list is not just the selector.
  test("a change to a .ts file reloads even when the selector is js only", async () => {
    const root = tmpDir({ "x.js": "module.exports = () => 'x';" });
    try {
      load(root, { watch: { debounceMs: 1 } }, ["js"]);
      await new Promise((r) => setTimeout(r, 150));
      logs.length = 0;
      fire(path.join("svc", "db.ts"), "change");
      expect(await waitFor(() => logs.length > 0)).toBe(true);
    } finally {
      cleanup(root);
    }
  }, 10000);

  test("README edits do not trigger a reload", async () => {
    const root = tmpDir({ "x.js": "module.exports = () => 'x';" });
    try {
      load(root, { watch: { debounceMs: 1 } }, ["js"]);
      // FSEvents may replay the fixture's own creation just after the watcher
      // arms (a legitimate reload); let that settle before measuring.
      await new Promise((r) => setTimeout(r, 150));
      logs.length = 0;
      fire("notes.md");
      await new Promise((r) => setTimeout(r, 40));
      expect(logs).toEqual([]);
    } finally {
      cleanup(root);
    }
  }, 10000);

  test("underscore-prefixed files never become endpoints", async () => {
    const root = tmpDir({ "y.js": "module.exports = () => 'y';" });
    try {
      const packages = load(root, { watch: { debounceMs: 1 } });
      fs.writeFileSync(path.join(root, "_private.js"), "module.exports = () => 'priv';");
      fire("_private.js", "rename");
      expect(await waitFor(() => logs.length > 0)).toBe(true);
      expect(packages._private).toBeUndefined();
      expect(Object.keys(packages)).toEqual(["y"]);
    } finally {
      cleanup(root);
    }
  }, 10000);

  // Scenario: a reload with no known file name (some platforms) still reloads
  // and logs without a "(changed: ...)" suffix.
  test("an event with no file name reloads without listing files", async () => {
    const root = tmpDir({ "z.js": "module.exports = () => 'z';" });
    try {
      load(root, { watch: { debounceMs: 1 } });
      fire(null, "rename");
      expect(await waitFor(() => logs.length > 0)).toBe(true);
      expect(logs[0]).toBe("Reloaded 1 controllers");
    } finally {
      cleanup(root);
    }
  }, 10000);

  // Scenario: extra service directories are watched too.
  test("watch.paths adds directories to watch", () => {
    const root = tmpDir({ "z.js": "module.exports = () => 'z';" });
    const svc = tmpDir({ "db.js": "module.exports = {};" });
    try {
      const packages = load(root, { watch: { paths: [svc] } });
      expect(watchSpy.mock.calls.map((c) => c[0])).toEqual([fs.realpathSync(root), fs.realpathSync(svc)]);
      deepRequire.stopWatching(packages);
    } finally {
      watchSpy.mockClear();
      cleanup(root);
      cleanup(svc);
    }
  });

  test("stopWatching closes the watcher and is a no-op for unwatched maps", async () => {
    const root = tmpDir({ "z.js": "module.exports = () => 'z';" });
    try {
      const packages = load(root, { watch: { debounceMs: 1 } });
      const closeSpy = jest.spyOn(openWatchers[0], "close");
      deepRequire.stopWatching(packages);
      expect(closeSpy).toHaveBeenCalled();
      deepRequire.stopWatching(packages);
      deepRequire.stopWatching({});
    } finally {
      cleanup(root);
    }
  });
});

describe("deepRequire — root-index edge cases", () => {
  // Scenario: a directory contains only `/index.js` (root index). The
  // file === "/index.js" early return engages and packages is empty.
  test("only-root-index.js returns empty packages", () => {
    const root = tmpDir({
      "index.js": "module.exports = () => 'root';",
    });
    try {
      const packages = deepRequire(root);
      expect(Object.keys(packages)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  // Scenario: a TypeScript project's root `/index.ts` file. The early
  // `/index.js` skip doesn't match (extension differs), but
  // computeEndpoint's "index" pop leaves pathParts empty — the
  // `pathParts.length === 0 → null` branch engages.
  test("root /index.<custom-ext> produces empty pathParts and is skipped", () => {
    const root = tmpDir({
      "index.ts": "module.exports = () => 'root-ts';",
      "users.ts": "module.exports = () => 'users-ts';",
    });
    try {
      const packages = deepRequire(root, ["ts"]);
      // Root index.ts maps to "" after pop, then returns null → not included.
      expect(packages[""]).toBeUndefined();
      expect(packages.index).toBeUndefined();
      expect(packages.users).toBeDefined();
    } finally {
      cleanup(root);
    }
  });
});
