/**
 * @fileoverview Option checks for `ape()` and `apeBun()`.
 *
 * Domain context: before 4.3.1 an option the library did not act on was accepted in
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
];

/** Documented in 4.3.0 and earlier but never applied. */
const UNSUPPORTED_OPTIONS = ["authFramework", "authMiddleware"];

/**
 * Reject options that are not supported and warn about unknown ones.
 *
 * @param {Object} options - The options object passed to `ape()` / `apeBun()`
 * @returns {void}
 * @throws {Error} If `authFramework` or `authMiddleware` is present
 */
function checkOptions(options) {
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
  const unknown = given.filter((key) => !KNOWN_OPTIONS.includes(key));
  if (unknown.length > 0) {
    apeLog.warn(
      `api-ape: ignoring unknown option(s) ${unknown.map((k) => `"${k}"`).join(", ")}. ` +
        `Known options: ${KNOWN_OPTIONS.join(", ")}.`,
    );
  }
}

module.exports = { checkOptions, KNOWN_OPTIONS, UNSUPPORTED_OPTIONS };
