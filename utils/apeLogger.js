/**
 * @fileoverview Central logging for api-ape internals
 *
 * Domain: Operators and developers need to silence or redirect framework
 * diagnostics without mutating global `console`. Host apps often enforce
 * structured logging or run tests where stderr noise breaks assertions.
 *
 * Technical: A process-wide (or browser tab–wide) active sink is set via
 * `configureApeLogging()` at server `ape()` init or before the browser client
 * connects. All internal modules call `apeLog.*` so behavior is consistent.
 * Default remains `console` so existing deployments see no change.
 *
 * @module utils/apeLogger
 */

/** @type {typeof console|undefined} */
const consoleRef = typeof console !== "undefined" ? console : undefined;

/**
 * Silent placeholder bound into {@link NOOP_LOGGER} levels when logging is off.
 *
 * @returns {void}
 */
const noop = () => {};

/**
 * Sink used when logging is disabled.
 * @private
 * @type {Readonly<ApeLoggingHandlers>}
 */
const NOOP_LOGGER = Object.freeze({
  log: noop,
  warn: noop,
  error: noop,
  info: noop,
  debug: noop,
});

/**
 * Bind global console methods so `this` is correct for sinks that care.
 * @returns {ApeLoggingHandlers}
 * @private
 */
function consoleSink() {
  if (!consoleRef) return { ...NOOP_LOGGER };
  const c = consoleRef;
  return {
    log: c.log.bind(c),
    warn: c.warn.bind(c),
    error: c.error.bind(c),
    info: c.info ? c.info.bind(c) : c.log.bind(c),
    debug: c.debug ? c.debug.bind(c) : c.log.bind(c),
  };
}

/**
 * Currently active handlers (mutable reference swapped by configure).
 * @private
 * @type {ApeLoggingHandlers}
 */
let active = consoleSink();

/**
 * Normalize caller `logging` option into handler map.
 *
 * @param {ApeLoggingOption|undefined} logging
 *   - `undefined` / `true`: use `console`
 *   - `false`: no internal api-ape logs
 *   - object: per-level overrides; missing levels fall back to `console`
 * @returns {void}
 */
function configureApeLogging(logging) {
  if (logging === false) {
    active = { ...NOOP_LOGGER };
    return;
  }
  if (logging === true || logging === undefined) {
    active = consoleSink();
    return;
  }
  if (logging && typeof logging === "object") {
    const base = consoleSink();
    active = {
      log: logging.log ? (...a) => logging.log(...a) : base.log,
      warn: logging.warn ? (...a) => logging.warn(...a) : base.warn,
      error: logging.error ? (...a) => logging.error(...a) : base.error,
      info: logging.info ? (...a) => logging.info(...a) : base.info,
      debug: logging.debug ? (...a) => logging.debug(...a) : base.debug,
    };
    return;
  }
  active = consoleSink();
}

/**
 * Restore default console logging (for test isolation).
 * @returns {void}
 */
function resetApeLoggingForTesting() {
  active = consoleSink();
}

/**
 * @typedef {Object} ApeLoggingHandlers
 * @property {(...args: any[]) => void} [log]
 * @property {(...args: any[]) => void} [warn]
 * @property {(...args: any[]) => void} [error]
 * @property {(...args: any[]) => void} [info]
 * @property {(...args: any[]) => void} [debug]
 */

/**
 * @typedef {boolean|ApeLoggingHandlers} ApeLoggingOption
 */

/**
 * Public facade — stable import for all internal modules.
 * @type {Readonly<ApeLoggingHandlers>}
 */
const apeLog = Object.freeze({
  log: (...a) => active.log(...a),
  warn: (...a) => active.warn(...a),
  error: (...a) => active.error(...a),
  info: (...a) => active.info(...a),
  debug: (...a) => active.debug(...a),
});

module.exports = {
  configureApeLogging,
  resetApeLoggingForTesting,
  apeLog,
};
