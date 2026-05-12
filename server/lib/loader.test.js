/**
 * @fileoverview Tests for the controller loader (api-ape/server/lib/loader.js).
 *
 * Domain context: the loader maps controller files under a `where` directory
 * to endpoint names. The default behaviour (`where: 'api'` is resolved against
 * `process.cwd()` at module-load time) suits most apps. Embedded servers and
 * multi-tenant runners that cannot rely on `process.cwd()` staying stable
 * pass an absolute path so cwd no longer matters.
 *
 * Technical context: the loader calls `path.isAbsolute(dirname)` to choose
 * between the legacy relative-path branch (cwd-resolved via cached
 * `currentDir`) and the new absolute-path branch (used verbatim). These
 * tests assert both branches load the same fixture controllers.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const loader = require("./loader");

describe("loader — `dirname` resolution", () => {
  let tmpAbsoluteFixture;

  beforeAll(() => {
    // Build an absolute-path fixture outside the api-ape source tree so we
    // can prove the absolute branch resolves it regardless of cwd.
    tmpAbsoluteFixture = fs.mkdtempSync(path.join(os.tmpdir(), "api-ape-loader-"));
    fs.writeFileSync(
      path.join(tmpAbsoluteFixture, "ping.js"),
      "module.exports = function () { return 'pong-abs'; };\n"
    );
  });

  afterAll(() => {
    fs.rmSync(tmpAbsoluteFixture, { recursive: true, force: true });
  });

  test("absolute `dirname` resolves directly, ignoring `process.cwd()`", () => {
    // Move cwd to a directory that does not contain the fixture; the loader
    // must still find the controller because the absolute path bypasses cwd.
    const savedCwd = process.cwd();
    try {
      process.chdir(os.tmpdir());
      const controllers = loader(tmpAbsoluteFixture);
      expect(controllers.ping).toBeInstanceOf(Function);
      expect(controllers.ping()).toBe("pong-abs");
    } finally {
      process.chdir(savedCwd);
    }
  });

  test("relative `dirname` resolves against the module-load cwd", () => {
    // The loader captured cwd at require-time (the jest worker's cwd is the
    // api-ape repo root). A relative path joined with that captured cwd
    // must still find the in-repo fixture under server/lib/__fixtures__/.
    // We place the fixture beside this test file so its existence is
    // intrinsic to the test rather than depending on external state.
    const relFixturePath = path.join(
      "server",
      "lib",
      "__fixtures__",
      "loader-relative"
    );
    const absFixturePath = path.join(__dirname, "__fixtures__", "loader-relative");
    fs.mkdirSync(absFixturePath, { recursive: true });
    fs.writeFileSync(
      path.join(absFixturePath, "ping.js"),
      "module.exports = function () { return 'pong-rel'; };\n"
    );
    try {
      const controllers = loader(relFixturePath);
      expect(controllers.ping).toBeInstanceOf(Function);
      expect(controllers.ping()).toBe("pong-rel");
    } finally {
      // Clean up the in-repo fixture so the working tree stays untouched.
      fs.rmSync(path.join(__dirname, "__fixtures__"), {
        recursive: true,
        force: true,
      });
    }
  });
});
