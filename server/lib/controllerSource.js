/**
 * @fileoverview Where a server's controllers come from: a folder (`where`) or a map
 * (`controllers`).
 *
 * Domain context: `where` scans a folder with `fs.readdirSync` and `require()`s every
 * file. A `bun build --compile` executable has no such folder, so the scan crashes at
 * start-up. `controllers` lets the app import its controllers itself and hand api-ape the
 * map `{ 'cards/move': fn }`; no file system is touched.
 *
 * Technical context: both options end as the same flat endpoint-keyed object that the
 * wiring and long-poll layers read, so nothing downstream knows which was used. A map key
 * follows the folder's naming rules by going through the SAME functions: the key is turned
 * into the file path it would have been (`/cards/move.js`) and handed to deepRequire's
 * `computeEndpoint` (index maps to the parent, `_private` is skipped) and `asController`
 * (a function, or a function `default`). Where the folder scan silently skips a file, a
 * map key is REFUSED: an app that lists an endpoint by hand must not find it missing.
 *
 * @module server/lib/controllerSource
 * @see {@link module:server/lib/loader} for the folder form
 * @see {@link module:server/lib/options} for the `where` / `controllers` exclusivity check
 */

const path = require("path");
const loader = require("./loader");
const { computeEndpoint, asController } = require("../utils/deepRequire");
const { hasOwn } = require("../../utils/safeKeys");
const { apeLog } = require("../../utils/apeLogger");

/** Public URL segment used when the server has no `where` to derive one from. */
const DEFAULT_PREFIX = "api";

/**
 * The endpoint a `controllers` key serves, or an error saying why the key is refused.
 *
 * @param {string} key - Key of the `controllers` map, e.g. `cards/move` or `/cards/move`
 * @returns {string} The endpoint, e.g. `cards/move`
 * @throws {Error} If the key is empty, has an empty segment, or is one the folder scan would skip
 */
function endpointOf(key) {
  const bare = key.replace(/^\//, "");
  /**
   * Stop startup, saying why this key cannot be an endpoint.
   *
   * @param {string} why - The reason, as a phrase
   * @returns {never} Always throws
   */
  const refuse = (why) => {
    throw new Error(`🦍 The controllers option has a key ${JSON.stringify(key)} that cannot be an endpoint: ${why}.`);
  };
  if (bare === "" || bare.split("/").some((segment) => segment === "")) {
    refuse("every segment between slashes needs a name (use `cards/move`)");
  }
  const endpoint = computeEndpoint(`/${bare}.js`);
  if (endpoint === null) {
    refuse(
      "the folder scan never serves a name like this (a segment starting with `_` is private, " +
        "`index` alone is the folder's own entry point, `.test` / `.spec` names are tests); rename it",
    );
  }
  return endpoint;
}

/**
 * Build the flat endpoint map from a `controllers` option.
 *
 * The result is a fresh object: endpoints added to the caller's map later are not served.
 *
 * @param {Object<string, Function|{default: Function}>} map - Endpoint path to controller (never null: `loadControllers` treats null as absent)
 * @returns {Object<string, Function>} Endpoint to function
 * @throws {Error} If `map` is not an object, a key is refused, two keys name one endpoint,
 *   or a value is not a function
 */
function fromMap(map) {
  if (typeof map !== "object" || Array.isArray(map)) {
    const found = Array.isArray(map) ? "an array" : typeof map;
    throw new Error(`🦍 The controllers option must be an object keyed by endpoint path ({ "cards/move": fn }), got ${found}.`);
  }
  const loaded = {};
  const keyOf = {};
  Object.keys(map).forEach((key) => {
    const endpoint = endpointOf(key);
    if (hasOwn(loaded, endpoint)) {
      throw new Error(
        `🦍 Duplicate endpoint detected: "${endpoint}"\n` +
          `   - ${JSON.stringify(keyOf[endpoint])}\n` +
          `   - ${JSON.stringify(key)}\n` +
          `   Remove one of these keys to fix this conflict.`,
      );
    }
    keyOf[endpoint] = key;
    loaded[endpoint] = asController(map[key], endpoint, "controllers option");
  });
  return loaded;
}

/**
 * Warn about options that only apply to a folder when a map is used.
 *
 * @param {Object} options - The options given to `ape()` / `apeBun()`
 * @returns {void}
 */
function warnFolderOnly(options) {
  const ignored = ["watch", "selector"].filter((name) => options[name] !== undefined);
  if (ignored.length > 0) {
    apeLog.warn(
      `api-ape: ignoring ${ignored.map((n) => `"${n}"`).join(" and ")}: they only apply to \`where\` ` +
        `(hot reload and file extensions concern a folder), not to \`controllers\`.`,
    );
  }
}

/**
 * Load the controllers a server was configured with.
 *
 * @param {Object} options - The options given to `ape()` / `apeBun()` (already checked)
 * @param {string} [options.where] - Folder to scan
 * @param {Object} [options.controllers] - Map of endpoint path to function
 * @param {string[]} [options.selector] - File extensions for the folder scan
 * @param {boolean|Object} [options.watch] - Hot reload of the folder
 * @param {{selector: boolean}} [forward] - `{ selector: true }` passes `options.selector` to the folder scan
 * @returns {{controllers: Object<string, Function>, controllersDir: string|null}} The endpoint
 *   map, and the folder it came from (null for a map)
 */
function loadControllers(options, forward = {}) {
  if (options.controllers != null) {
    warnFolderOnly(options);
    return { controllers: fromMap(options.controllers), controllersDir: null };
  }
  const { where, watch } = options;
  return {
    controllers: loader(where, forward.selector ? options.selector : undefined, { watch }),
    controllersDir: path.isAbsolute(where) ? where : path.join(process.cwd(), where),
  };
}

/**
 * The public URL segment of the api-ape routes (`/${prefix}/ape`).
 *
 * `urlPrefix` wins; else an absolute `where` collapses to its basename and a relative one
 * is used as is; with a `controllers` map (no folder) it is `api`, where the browser
 * client dials. Leading and trailing slashes are stripped.
 *
 * @param {Object} options - The options given to `ape()` / `apeBun()`
 * @param {string} [options.where] - Folder, when the server has one
 * @param {string} [options.urlPrefix] - Explicit prefix
 * @returns {string} Prefix without slashes at either end
 */
function publicPrefix({ where, urlPrefix }) {
  if (urlPrefix) return urlPrefix.replace(/^\/+|\/+$/g, "");
  if (where == null) return DEFAULT_PREFIX;
  return path.isAbsolute(where) ? path.basename(where) : where.replace(/^\.?\/+|\/+$/g, "");
}

module.exports = { loadControllers, publicPrefix, DEFAULT_PREFIX };
