/**
 * @fileoverview Opt-in controller hot reload: file watching and module-cache
 * invalidation.
 *
 * ## Contract (what `watch` does, and what it cannot do)
 *
 * Hot reload is OFF unless the app passes `watch` (`true` or an object). It is
 * a development tool, not a production feature: with it on, files changed on
 * disk are loaded into the running process.
 *
 * When a watched file changes, api-ape:
 *
 * 1. waits `debounceMs` (default 50) so a save or a `git checkout` becomes one
 *    reload,
 * 2. evicts EVERY module under the watched roots from `require.cache` (the
 *    controller directory plus any `watch.paths`), except `node_modules`,
 * 3. re-requires ALL controllers, so a controller and the service modules it
 *    imports are fresh together,
 * 4. swaps the new set into the controller map in place. If any controller
 *    fails to load (syntax error, duplicate endpoint) the previous set keeps
 *    serving and the error is logged.
 *
 * Limits:
 *
 * - Only modules under the watched roots are evicted. A module outside them
 *   (a database singleton, a shared library) stays cached, and anything it
 *   holds is not reloaded. List its directory in `watch.paths` to reload it,
 *   knowing that a module which opens a connection at load time will open a
 *   new one.
 * - State already captured by the old modules (open connections, timers,
 *   subscriptions, objects handed to clients) is not migrated or closed.
 * - Eviction works on `require.cache`. On Node that means CommonJS modules only:
 *   ES modules loaded through `import` have a separate cache that Node does not let
 *   a library clear. Bun (1.3.14, tested) evicts `require()`d `.js` and `.ts`
 *   modules; a manual probe showed `import`ed ESM files reloading too, but no
 *   test covers that, so treat it as unverified and use `bun --hot` if you rely on it.
 * - Recursive `fs.watch` is needed (macOS, Windows, Linux with Node 20+).
 *   Elsewhere a warning is logged and nothing is watched.
 * - Calls already running mostly finish on the old code, but a lazy `require()` inside
 *   a running call made after an eviction loads the new module. The next call uses the new set.
 * - `watch.paths` entries are resolved against `process.cwd()` when `ape` starts (`where`
 *   is resolved against the cwd captured when api-ape was loaded); pass absolute paths.
 * - api-ape's own modules are never evicted, even if a watched root contains them.
 *
 * @module server/utils/hotReload
 */

const fs = require("fs");
const path = require("path");
const { apeLog } = require("../../utils/apeLogger");

const DEFAULT_DEBOUNCE_MS = 50;

/** api-ape's own code (server/ and utils/): never evicted, its singletons hold live clients. */
const OWN_ROOTS = [path.resolve(__dirname, ".."), path.resolve(__dirname, "..", "..", "utils")].map(
  (r) => r + path.sep,
);

/** Source extensions that trigger a reload wherever they change under a watched root. */
const SOURCE_EXTENSIONS = ["js", "cjs", "mjs", "ts", "mts", "cts", "jsx", "tsx", "json"];

/**
 * Resolve a directory to its real path. `require.cache` is keyed by real paths
 * (on macOS `/var/...` is `/private/var/...`), so a root given through a symlink
 * would otherwise never match a cached module.
 *
 * @param {string} dir - Directory path
 * @returns {string} Real absolute path, or the resolved path if it does not exist
 * @private
 */
function realRoot(dir) {
  try {
    return fs.realpathSync(path.resolve(dir));
  } catch {
    return path.resolve(dir);
  }
}

/**
 * Normalise the `watch` option.
 *
 * @param {boolean|{paths?: string[], debounceMs?: number}|undefined} watch - User option
 * @param {string} controllersDir - Absolute controller directory
 * @returns {{roots: string[], debounceMs: number}|null} Null when hot reload is off
 * @throws {Error} When `watch.paths` is not an array
 */
function normaliseWatch(watch, controllersDir) {
  if (!watch) return null;
  const opts = watch === true ? {} : watch;
  if (opts.paths !== undefined && !Array.isArray(opts.paths)) {
    throw new Error("api-ape: watch.paths must be an array of directories");
  }
  if (opts.debounceMs !== undefined && !(Number.isFinite(opts.debounceMs) && opts.debounceMs >= 0)) {
    throw new Error("api-ape: watch.debounceMs must be a non-negative number");
  }
  const roots = [controllersDir, ...(opts.paths || []).map((p) => path.resolve(p))];
  return {
    roots: roots.map(realRoot).filter((r, i, all) => all.indexOf(r) === i),
    debounceMs: opts.debounceMs === undefined ? DEFAULT_DEBOUNCE_MS : opts.debounceMs,
  };
}

/**
 * Evict every cached module that lives under one of `roots`.
 *
 * @param {string[]} roots - Absolute directories
 * @param {Object} [cache=require.cache] - Module cache (injectable for tests)
 * @param {Map<string, Object>} [saved] - Receives the evicted entries (for `restoreModules`)
 * @returns {number} Number of modules evicted
 */
function invalidateModules(roots, cache = require.cache, saved = new Map()) {
  const prefixes = roots.map((r) => path.resolve(r) + path.sep);
  const nm = `${path.sep}node_modules${path.sep}`;
  let removed = 0;
  for (const file of Object.keys(cache)) {
    if (file.includes(nm) || OWN_ROOTS.some((r) => file.startsWith(r))) continue;
    if (prefixes.some((p) => file.startsWith(p))) {
      saved.set(file, cache[file]);
      delete cache[file];
      removed += 1;
    }
  }
  return removed;
}

/**
 * Undo a failed reload: drop whatever the failed load put in the cache under
 * `roots`, then put back the entries that `invalidateModules` saved, so lazy
 * `require()` calls inside the still-serving old controllers get the old modules.
 *
 * @param {string[]} roots - Absolute directories that were invalidated
 * @param {Map<string, Object>} saved - Entries collected by `invalidateModules`
 * @param {Object} [cache=require.cache] - Module cache (injectable for tests)
 * @returns {void}
 */
function restoreModules(roots, saved, cache = require.cache) {
  invalidateModules(roots, cache);
  for (const [file, entry] of saved) cache[file] = entry;
}

/**
 * Whether recursive `fs.watch` works on this platform.
 *
 * @param {string} [platform=process.platform] - Platform name
 * @param {string} [nodeVersion=process.versions.node] - Node version string
 * @returns {boolean} True on macOS, Windows, and Linux with Node 20+
 */
function supportsRecursiveWatch(platform = process.platform, nodeVersion = process.versions.node) {
  const major = parseInt(nodeVersion.split(".")[0], 10);
  return platform === "darwin" || platform === "win32" || (platform === "linux" && major >= 20);
}

/**
 * Whether a changed relative file name should trigger a reload.
 *
 * @param {string} filename - Path relative to the watched root
 * @param {string[]} extensions - Extensions (no dot) that count as source
 * @returns {boolean} True for a source file outside node_modules and dot-directories
 * @private
 */
function relevant(filename, extensions) {
  const parts = filename.split(path.sep);
  if (parts.some((p) => p === "node_modules" || p.startsWith("."))) return false;
  return extensions.some((ext) => filename.endsWith(`.${ext}`));
}

/**
 * Watch directories and call `onChange` once per burst of relevant changes.
 *
 * @param {Object} options
 * @param {string[]} options.roots - Absolute directories to watch recursively
 * @param {string[]} options.extensions - Extensions (no dot) that trigger a reload
 * @param {number} options.debounceMs - Quiet period before `onChange` fires
 * @param {Function} options.onChange - Called with the absolute changed paths
 * @param {Function} [options.watch=fs.watch] - Watch function (injectable)
 * @param {boolean} [options.supported] - Override platform detection
 * @param {Function} [options.warn] - Warning sink (defaults to the api-ape logger)
 * @returns {{close: Function}} Handle; `close()` stops watching
 */
function watchDirs({ roots, extensions, debounceMs, onChange, watch, supported, warn }) {
  const doWatch = watch || ((...args) => fs.watch(...args));
  const report = warn || ((m) => apeLog.warn(m));
  const watchers = [];
  const changed = new Set();
  let timer = null;

  if (!(supported === undefined ? supportsRecursiveWatch() : supported)) {
    report(
      "[api-ape] watch: recursive fs.watch is not supported on this platform/Node version; " +
        "hot reload is disabled (use Node 20+ on Linux, or restart on change).",
    );
    return {
      /** Nothing was watched, so there is nothing to close. */
      close() {},
    };
  }

  /** Restart the debounce timer; when it fires, report the batched changes once. */
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const files = [...changed];
      changed.clear();
      timer = null;
      onChange(files);
    }, debounceMs);
  }

  for (const root of roots) {
    let watcher;
    try {
      watcher = doWatch(root, { recursive: true }, (eventType, filename) => {
        if (filename) {
          if (!relevant(filename, extensions)) return;
          changed.add(path.join(root, filename));
        }
        schedule();
      });
    } catch (err) {
      report(`[api-ape] watch: cannot watch ${root}: ${err.message}`);
      continue;
    }
    watcher.on("error", (err) => report(`[api-ape] watch: ${root}: ${err.message}`));
    if (typeof watcher.unref === "function") watcher.unref();
    watchers.push(watcher);
  }

  return {
    /** Stop watching and cancel any pending reload. Safe to call twice. */
    close() {
      clearTimeout(timer);
      timer = null;
      for (const w of watchers.splice(0)) {
        try {
          w.close();
        } catch {
          /* already closed */
        }
      }
    },
  };
}

module.exports = {
  normaliseWatch,
  invalidateModules,
  restoreModules,
  supportsRecursiveWatch,
  watchDirs,
  SOURCE_EXTENSIONS,
};
