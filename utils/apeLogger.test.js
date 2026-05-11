/**
 * @fileoverview Coverage tests for utils/apeLogger.
 *
 * The logger has three configuration modes (default/`true`, `false`, and a
 * custom-handler object) and a five-level facade (log/warn/error/info/debug).
 * These tests drive every branch of `configureApeLogging` and exercise every
 * facade method so the gate's per-statement, per-function, and per-branch
 * counters all hit 100% on this module.
 *
 * The module's public interface is the named exports: `apeLog`,
 * `configureApeLogging`, `resetApeLoggingForTesting`. Tests interact through
 * those exports only.
 */

const { apeLog, configureApeLogging, resetApeLoggingForTesting } = require("./apeLogger.js");

describe("apeLogger", () => {
  let consoleSpies;

  beforeEach(() => {
    // Spy on every console level so we can assert routing without leaking
    // output into the Jest report.
    consoleSpies = {
      log: jest.spyOn(console, "log").mockImplementation(() => {}),
      warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
      error: jest.spyOn(console, "error").mockImplementation(() => {}),
      info: jest.spyOn(console, "info").mockImplementation(() => {}),
      debug: jest.spyOn(console, "debug").mockImplementation(() => {}),
    };
    resetApeLoggingForTesting();
  });

  afterEach(() => {
    Object.values(consoleSpies).forEach((s) => s.mockRestore());
    resetApeLoggingForTesting();
  });

  describe("default sink (console)", () => {
    it("routes every facade level to the matching console method", () => {
      apeLog.log("a");
      apeLog.warn("b");
      apeLog.error("c");
      apeLog.info("d");
      apeLog.debug("e");

      expect(consoleSpies.log).toHaveBeenCalledWith("a");
      expect(consoleSpies.warn).toHaveBeenCalledWith("b");
      expect(consoleSpies.error).toHaveBeenCalledWith("c");
      expect(consoleSpies.info).toHaveBeenCalledWith("d");
      expect(consoleSpies.debug).toHaveBeenCalledWith("e");
    });
  });

  describe("configureApeLogging(true)", () => {
    it("uses console (same as default)", () => {
      configureApeLogging(true);
      apeLog.log("hi");
      expect(consoleSpies.log).toHaveBeenCalledWith("hi");
    });
  });

  describe("configureApeLogging(undefined)", () => {
    it("falls back to console", () => {
      configureApeLogging(undefined);
      apeLog.warn("u");
      expect(consoleSpies.warn).toHaveBeenCalledWith("u");
    });
  });

  describe("configureApeLogging(false)", () => {
    it("silences every level", () => {
      configureApeLogging(false);
      apeLog.log("hidden");
      apeLog.warn("hidden");
      apeLog.error("hidden");
      apeLog.info("hidden");
      apeLog.debug("hidden");
      expect(consoleSpies.log).not.toHaveBeenCalled();
      expect(consoleSpies.warn).not.toHaveBeenCalled();
      expect(consoleSpies.error).not.toHaveBeenCalled();
      expect(consoleSpies.info).not.toHaveBeenCalled();
      expect(consoleSpies.debug).not.toHaveBeenCalled();
    });
  });

  describe("configureApeLogging(object)", () => {
    it("routes each provided level to the supplied handler", () => {
      const handlers = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
      };
      configureApeLogging(handlers);

      apeLog.log("L");
      apeLog.warn("W");
      apeLog.error("E");
      apeLog.info("I");
      apeLog.debug("D");

      expect(handlers.log).toHaveBeenCalledWith("L");
      expect(handlers.warn).toHaveBeenCalledWith("W");
      expect(handlers.error).toHaveBeenCalledWith("E");
      expect(handlers.info).toHaveBeenCalledWith("I");
      expect(handlers.debug).toHaveBeenCalledWith("D");
      // No console fallback when all five levels supplied.
      expect(consoleSpies.log).not.toHaveBeenCalled();
    });

    it("falls back to console for missing levels", () => {
      // Provide only error; the other four must route to console.
      const errorHandler = jest.fn();
      configureApeLogging({ error: errorHandler });

      apeLog.log("L");
      apeLog.warn("W");
      apeLog.error("E");
      apeLog.info("I");
      apeLog.debug("D");

      expect(errorHandler).toHaveBeenCalledWith("E");
      expect(consoleSpies.log).toHaveBeenCalledWith("L");
      expect(consoleSpies.warn).toHaveBeenCalledWith("W");
      expect(consoleSpies.info).toHaveBeenCalledWith("I");
      expect(consoleSpies.debug).toHaveBeenCalledWith("D");
      // The error console must NOT have been called — the custom handler took it.
      expect(consoleSpies.error).not.toHaveBeenCalled();
    });

    it("treats null as the no-overrides case and falls back to console", () => {
      // `null` is typeof 'object' but the branch test is `if (logging && ...)`.
      // The truthiness gate rejects it, so we fall through to consoleSink().
      configureApeLogging(null);
      apeLog.log("L");
      expect(consoleSpies.log).toHaveBeenCalledWith("L");
    });
  });

  describe("resetApeLoggingForTesting", () => {
    it("restores the console sink after being silenced", () => {
      configureApeLogging(false);
      resetApeLoggingForTesting();
      apeLog.log("back");
      expect(consoleSpies.log).toHaveBeenCalledWith("back");
    });
  });

  describe("host-environment fallbacks", () => {
    // These tests exercise the legacy/non-standard host paths inside
    // apeLogger.js: a globally-missing `console`, and consoles that lack
    // `info` or `debug` (e.g. legacy IE). They require swapping the
    // global `console` reference, so they use jest.isolateModules to
    // re-load apeLogger.js under the desired host environment.

    let originalConsole;

    beforeEach(() => {
      originalConsole = globalThis.console;
    });

    afterEach(() => {
      globalThis.console = originalConsole;
    });

    it("uses a noop sink when `console` is globally undefined at module load", () => {
      // Drop `console` before requiring so consoleRef captures undefined,
      // which forces consoleSink() through its `if (!consoleRef)` branch.
      globalThis.console = undefined;
      jest.isolateModules(() => {
        const { apeLog: isolatedApeLog } = require("./apeLogger.js");
        // All five levels must be safe no-ops when console is absent.
        expect(() => {
          isolatedApeLog.log("x");
          isolatedApeLog.warn("x");
          isolatedApeLog.error("x");
          isolatedApeLog.info("x");
          isolatedApeLog.debug("x");
        }).not.toThrow();
      });
    });

    it("routes info/debug to log when console lacks those methods", () => {
      // Install a stripped console: log/warn/error present, info/debug
      // missing. Forces lines 51-52 to take the falsy ternary branch
      // and re-bind info/debug onto log.
      const strippedLog = jest.fn();
      const strippedWarn = jest.fn();
      const strippedError = jest.fn();
      globalThis.console = {
        log: strippedLog,
        warn: strippedWarn,
        error: strippedError,
        // info and debug intentionally absent
      };

      jest.isolateModules(() => {
        const { apeLog: isolatedApeLog } = require("./apeLogger.js");
        isolatedApeLog.info("I");
        isolatedApeLog.debug("D");
        // Both calls collapse to console.log when the level is missing.
        expect(strippedLog).toHaveBeenCalledWith("I");
        expect(strippedLog).toHaveBeenCalledWith("D");
        expect(strippedLog).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("partial custom-handler maps", () => {
    // Cover every individual level's "supplied vs missing" branch by
    // toggling each one in isolation.
    const cases = ["log", "warn", "error", "info", "debug"];

    cases.forEach((level) => {
      it(`routes ${level} to the supplied handler when only ${level} is provided`, () => {
        const handler = jest.fn();
        configureApeLogging({ [level]: handler });
        apeLog[level]("x");
        expect(handler).toHaveBeenCalledWith("x");
      });
    });

    cases.forEach((level) => {
      it(`falls back to console.${level} when only the other levels are provided`, () => {
        // Provide every level EXCEPT the one under test; verify the
        // omitted level routes to console.
        const handlers = {};
        cases.filter((c) => c !== level).forEach((c) => {
          handlers[c] = jest.fn();
        });
        configureApeLogging(handlers);
        apeLog[level]("fallback");
        expect(consoleSpies[level]).toHaveBeenCalledWith("fallback");
      });
    });
  });
});
