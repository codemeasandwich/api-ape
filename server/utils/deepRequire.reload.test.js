/**
 * @fileoverview Real-Node proof of coherent hot reload.
 *
 * Domain context: the old watcher reloaded only the edited controller file, so
 * the service modules it imported stayed stale ("mixing"). The opt-in watcher
 * must reload the controller AND the modules it imports, together.
 *
 * Technical context: Jest's module registry ignores `delete require.cache`, so
 * this test runs the scenario in a child `node` process where `require.cache`
 * is real. The child edits a service module that two controllers import and
 * reports what each controller returns after the reload.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEEP = path.join(__dirname, "deepRequire.js");

function runScenario(watchExpr) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ape-reload-"));
  try {
    fs.mkdirSync(path.join(root, "api"));
    fs.mkdirSync(path.join(root, "svc"));
    fs.writeFileSync(path.join(root, "svc/state.js"), "module.exports = { v: 'svc1' };");
    for (const n of ["a", "b"]) {
      fs.writeFileSync(
        path.join(root, `api/${n}.js`),
        `const s = require('../svc/state'); module.exports = () => '${n}1:' + s.v;`,
      );
    }
    const script = `
      const fs = require('fs'), path = require('path');
      const deepRequire = require(${JSON.stringify(DEEP)});
      const root = ${JSON.stringify(root)};
      const api = deepRequire(path.join(root, 'api'), undefined, { watch: ${watchExpr} });
      const before = [api.a(), api.b()];
      // let the OS watcher arm, then edit ONLY the service module and controller a
      setTimeout(() => {
        fs.writeFileSync(path.join(root, 'svc/state.js'), "module.exports = { v: 'svc2' };");
        fs.writeFileSync(path.join(root, 'api/a.js'),
          "const s = require('../svc/state'); module.exports = () => 'a2:' + s.v;");
        const deadline = Date.now() + 5000;
        (function poll() {
          if (api.a().startsWith('a2') || Date.now() > deadline) {
            setTimeout(() => {
              console.log(JSON.stringify({ before, after: [api.a(), api.b()] }));
              deepRequire.stopWatching(api);
              process.exit(0);
            }, 300);
          } else setTimeout(poll, 25);
        })();
      }, 600);
    `;
    const r = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 20000 });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return JSON.parse(r.stdout.trim().split("\n").pop());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("deepRequire hot reload in a real Node process", () => {
  // Scenario: the service directory is listed in watch.paths. Controller a was
  // edited and the shared service changed: BOTH controllers must see svc2, even
  // though controller b's own file never changed.
  test("watch.paths reloads imported service modules and untouched controllers coherently", () => {
    // the expression is evaluated in the child, where `root` is the fixture dir
    const r = runScenario("{ debounceMs: 20, paths: [path.join(root, 'svc')] }");
    expect(r.before).toEqual(["a1:svc1", "b1:svc1"]);
    expect(r.after).toEqual(["a2:svc2", "b1:svc2"]);
  }, 30000);

  // Scenario: the same coherent reload through the per-directory fallback that
  // Linux before Node 20 uses (forced here with watch.recursive:false so it is
  // exercised on every platform against the real filesystem).
  test("per-directory fallback (recursive:false) reloads coherently too", () => {
    const r = runScenario("{ debounceMs: 20, recursive: false, paths: [path.join(root, 'svc')] }");
    expect(r.before).toEqual(["a1:svc1", "b1:svc1"]);
    expect(r.after).toEqual(["a2:svc2", "b1:svc2"]);
  }, 30000);

  // Scenario: only the controller directory is watched (watch: true). The
  // controller is reloaded but the service it imports is outside the roots and
  // stays cached: the documented limit, which watch.paths exists to lift.
  test("watch:true alone does not reload modules outside the controller directory", () => {
    const r = runScenario("true");
    expect(r.before).toEqual(["a1:svc1", "b1:svc1"]);
    expect(r.after).toEqual(["a2:svc1", "b1:svc1"]);
  }, 30000);

  // Scenario: a service is edited and a controller is saved half-typed. The reload
  // fails, so the old controllers must keep serving, INCLUDING a handler that
  // requires the service lazily at call time: it must get the OLD service (svc1),
  // not the new one, so the cache must be put back, not left evicted.
  test("a failed reload restores the module cache for lazy require() in old controllers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ape-fail-"));
    try {
      fs.mkdirSync(path.join(root, "api"));
      fs.mkdirSync(path.join(root, "svc"));
      fs.writeFileSync(path.join(root, "svc/state.js"), "module.exports = { v: 'svc1' };");
      fs.writeFileSync(
        path.join(root, "api/a.js"),
        "module.exports = () => 'a1:' + require('../svc/state').v;",
      );
      const script = `
        const fs = require('fs'), path = require('path');
        const logger = require(${JSON.stringify(path.join(__dirname, "../../utils/apeLogger"))});
        const errors = [];
        logger.configureApeLogging({ error: (m) => errors.push(m), log() {}, warn() {}, info() {}, debug() {} });
        const deepRequire = require(${JSON.stringify(DEEP)});
        const root = ${JSON.stringify(root)};
        const api = deepRequire(path.join(root, 'api'), undefined,
          { watch: { debounceMs: 20, paths: [path.join(root, 'svc')] } });
        const before = api.a();
        setTimeout(() => {
          // a valid new service, but a controller saved half-typed: the reload fails
          fs.writeFileSync(path.join(root, 'svc/state.js'), "module.exports = { v: 'svc2' };");
          fs.writeFileSync(path.join(root, 'api/a.js'), "module.exports = () => {{{ broken");
          const deadline = Date.now() + 5000;
          (function poll() {
            if (errors.length || Date.now() > deadline) {
              let after, threw = null;
              try { after = api.a(); } catch (e) { threw = e.message; }
              console.log(JSON.stringify({ before, after, threw, failed: errors.length > 0 }));
              deepRequire.stopWatching(api);
              process.exit(0);
            } else setTimeout(poll, 25);
          })();
        }, 600);
      `;
      const r = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 20000 });
      if (r.status !== 0) throw new Error(r.stderr || r.stdout);
      const out = JSON.parse(r.stdout.trim().split("\n").pop());
      expect(out.failed).toBe(true);
      expect(out.threw).toBeNull();
      expect(out.before).toBe("a1:svc1");
      expect(out.after).toBe("a1:svc1");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});
