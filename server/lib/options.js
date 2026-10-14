/**
 * @fileoverview Option checks for `ape()` and `apeBun()`.
 *
 * Domain context: before 4.4.0 an option the library did not act on was accepted in
 * silence. `authFramework` and `authMiddleware` were documented and then dropped, so a
 * server that believed it enforced authentication enforced nothing.
 *
 * Technical context: `authFramework` / `authMiddleware` are REJECTED (startup throws)
 * rather than wired. Wiring them would cover the WebSocket path only; the Node HTTP
 * long-poll fallback (`/{prefix}/ape/poll`) has no auth hooks, so a server using them
 * would still answer unauthenticated poll requests: a false sense of security is
 * worse than a startup error. Any other unknown key only produces a warning, because
 * a typo should be noticed but a harmless extra key (the simulator passes `adapter`)
 * must not take a server down in a patch release.
 *
 * @module server/lib/options
 */

const { apeLog } = require("../../utils/apeLogger");

/** Options `ape()` and `apeBun()` act on. */
const KNOWN_OPTIONS = [
  "where",
  "controllers",
  "urlPrefix",
  "selector",
  "onConnect",
  "fileTransferOptions",
  "longPollingOptions",
  "origin",
  "watch",
  "websocketOptions",
  "logging",
  "transport",
  "maxMessageBytes",
];

/**
 * Default `maxMessageBytes`: the most a peer may send in one WebSocket message or one
 * long-poll POST body. Every inbound frame is parsed in full before anything checks who
 * sent it, so the cap is what bounds the memory and CPU a stranger can spend. Uploads are
 * separate HTTP PUTs and are not affected.
 * @constant {number}
 */
const DEFAULT_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

/** Documented in 4.3.0 and earlier but never applied. */
const UNSUPPORTED_OPTIONS = ["authFramework", "authMiddleware"];

/**
 * `where` (scan a folder) and `controllers` (a map of endpoint path to function, for
 * compiled executables) are two ways to say the same thing: exactly one is required.
 *
 * @param {Object} options - The options object passed to `ape()` / `apeBun()`
 * @returns {void}
 * @throws {Error} If both or neither is given
 */
function checkControllerSource(options) {
  const hasWhere = options.where != null;
  const hasControllers = options.controllers != null;
  if (hasWhere && hasControllers) {
    throw new Error(
      "api-ape: pass either `where` (a folder of controller files to scan) or `controllers` " +
        "(a map of endpoint path to function), not both.",
    );
  }
  if (!hasWhere && !hasControllers) {
    throw new Error(
      "api-ape: the options need `where` (a folder of controller files, e.g. { where: \"api\" }) " +
        "or `controllers` (a map of endpoint path to function, e.g. { controllers: { hello } }, " +
        "for a compiled executable with no folder).",
    );
  }
}

/**
 * Reject options that are not supported and warn about unknown ones.
 *
 * @param {Object} options - The options object passed to `ape()` / `apeBun()`
 * @returns {void}
 * @throws {Error} If `options` is not an object, or if `authFramework` or `authMiddleware` is present
 */
function checkOptions(options) {
  if (options === null || typeof options !== "object") {
    throw new Error(
      `api-ape: options must be an object such as { where: "api" }, got ${options === null ? "null" : typeof options}`,
    );
  }
  const given = Object.keys(options);
  const unsupported = given.filter((key) => UNSUPPORTED_OPTIONS.includes(key));
  if (unsupported.length > 0) {
    throw new Error(
      `api-ape: the ${unsupported.map((k) => `"${k}"`).join(" and ")} option is not supported ` +
        `and was never applied: passing it would leave endpoints unauthenticated. ` +
        `Authenticate in onConnect (refuse the socket, or return embed values such as { user }) ` +
        `and check them in controllers.`,
    );
  }
  checkControllerSource(options);
  const unknown = given.filter((key) => !KNOWN_OPTIONS.includes(key));
  if (unknown.length > 0) {
    apeLog.warn(
      `api-ape: ignoring unknown option(s) ${unknown.map((k) => `"${k}"`).join(", ")}. ` +
        `Known options: ${KNOWN_OPTIONS.join(", ")}.`,
    );
  }
}

module.exports = { checkOptions, KNOWN_OPTIONS, UNSUPPORTED_OPTIONS, DEFAULT_MAX_MESSAGE_BYTES };
