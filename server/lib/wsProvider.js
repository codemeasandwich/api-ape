/**
 * @fileoverview WebSocket Provider - Runtime-Aware WebSocket Implementation
 *
 * This module provides automatic detection of the JavaScript runtime environment
 * and returns the most appropriate WebSocket implementation. It abstracts away
 * the differences between Deno, Bun, Node.js, and provides a fallback polyfill.
 *
 * Provider Selection Priority:
 * 1. **Deno Native**: Uses `Deno.upgradeWebSocket()` for optimal performance
 * 2. **Bun Native**: Uses Bun's built-in WebSocket server
 * 3. **Node.js 24+ Native**: Uses the stable `node:ws` module (when available)
 * 4. **Polyfill**: Uses our RFC 6455 compliant implementation
 *
 * The provider is cached after first detection to ensure consistent behavior
 * throughout the application lifecycle.
 *
 * @module server/lib/wsProvider
 * @see {@link module:server/lib/ws} - WebSocket polyfill implementation
 * @see {@link module:server/lib/ws/adapters/bun} - Bun adapter
 * @see {@link module:server/lib/ws/adapters/deno} - Deno adapter
 *
 * @example
 * // Get the appropriate WebSocket provider for the current runtime
 * const { getWebSocketProvider } = require('./wsProvider')
 *
 * const { type, WebSocketServer, runtime } = getWebSocketProvider()
 * console.log(`Using ${type} WebSocket on ${runtime}`)
 *
 * // Create a WebSocket server
 * const wss = new WebSocketServer({ noServer: true })
 * wss.on('connection', (ws) => {
 *     console.log('Client connected')
 * })
 *
 * @example
 * // Check runtime environment
 * const { getRuntime, isDeno, isBun } = require('./wsProvider')
 *
 * console.log('Runtime:', getRuntime())
 * console.log('Is Deno:', isDeno())
 * console.log('Is Bun:', isBun())
 */

/**
 * @typedef {Object} WebSocketProvider
 * Result from getWebSocketProvider() with runtime-appropriate WebSocket implementation.
 *
 * @property {string} type - The provider type identifier:
 *   - 'deno-native': Deno's built-in WebSocket
 *   - 'bun-native': Bun's built-in WebSocket
 *   - 'node-native': Node.js 24+ stable native WebSocket
 *   - 'polyfill': Our RFC 6455 compliant implementation
 * @property {typeof import('./ws').WebSocketServer} WebSocketServer - WebSocket server constructor
 * @property {string} runtime - The detected runtime ('deno', 'bun', 'node', 'unknown')
 */

/**
 * @typedef {'deno'|'bun'|'node'|'unknown'} RuntimeType
 * The detected JavaScript runtime environment.
 */

/**
 * Runtime override for testing. Set to mock runtime detection.
 * @private
 * @type {{deno?: boolean, bun?: boolean, node24?: boolean}|null}
 */
let _runtimeOverride = null;

/**
 * Set runtime override for testing purposes.
 * @param {{deno?: boolean, bun?: boolean, node24?: boolean}|null} override
 */
function _setRuntimeOverride(override) {
  _runtimeOverride = override;
  // Clear cached provider when runtime changes
  cachedProvider = null;
}

/**
 * Get current runtime override (for testing).
 * @returns {{deno?: boolean, bun?: boolean, node24?: boolean}|null}
 */
function _getRuntimeOverride() {
  return _runtimeOverride;
}

/**
 * Checks if the code is running in the Deno runtime.
 *
 * Detection method: Checks for the global `Deno` object and its
 * `upgradeWebSocket` function, which is Deno's WebSocket upgrade API.
 *
 * @function isDeno
 * @returns {boolean} True if running in Deno
 *
 * @example
 * if (isDeno()) {
 *     console.log('Running in Deno')
 *     // Use Deno-specific APIs
 * }
 */
function isDeno() {
  // Check test override first
  if (_runtimeOverride?.deno !== undefined) {
    return _runtimeOverride.deno;
  }
  // Actual runtime detection
  return (
    typeof Deno !== "undefined" && typeof Deno.upgradeWebSocket === "function"
  );
}

/**
 * Checks if the code is running in the Bun runtime.
 *
 * Detection method: Checks `process.versions.bun`, which is the officially
 * recommended way to detect Bun according to Bun's documentation.
 *
 * Note: Bun also sets `process.versions.node`, so checking for Node.js
 * detection should exclude Bun first.
 *
 * @function isBun
 * @returns {boolean} True if running in Bun
 *
 * @example
 * if (isBun()) {
 *     console.log('Running in Bun version:', process.versions.bun)
 *     // Use Bun-specific APIs like Bun.serve()
 * }
 */
function isBun() {
  // Check test override first
  if (_runtimeOverride?.bun !== undefined) {
    return _runtimeOverride.bun;
  }
  // Actual runtime detection
  return typeof process !== "undefined" && !!process.versions?.bun;
}

/**
 * Checks if running on Node.js version 24+ with stable WebSocket support.
 *
 * Node.js 24 introduced a stable, built-in WebSocket module (`node:ws`)
 * that doesn't require external dependencies. This function checks:
 *
 * 1. That we're running in Node.js (not Bun, which also has `process.versions.node`)
 * 2. That the major version is 24 or higher
 * 3. That it's a stable release (not RC, alpha, or beta)
 *
 * Pre-release versions are identified by hyphens in the version string
 * (e.g., "24.0.0-rc.1").
 *
 * @function isNode24Stable
 * @returns {boolean} True if running on Node.js 24+ stable
 *
 * @example
 * if (isNode24Stable()) {
 *     // Can use native node:ws module
 *     const { WebSocketServer } = require('node:ws')
 * } else {
 *     // Fall back to polyfill or external package
 * }
 */
function isNode24Stable() {
  // Check test override first
  if (_runtimeOverride?.node24 !== undefined) {
    return _runtimeOverride.node24;
  }

  // Actual runtime detection
  /* istanbul ignore next 6 - only reachable in browser/non-Node environments */
  if (
    typeof process === "undefined" ||
    !process.versions ||
    !process.versions.node
  ) {
    return false;
  }

  // Skip if this is actually Bun (Bun also sets process.versions.node)
  if (isBun()) {
    return false;
  }

  const versionStr = process.versions.node;
  const majorVersion = parseInt(versionStr.split(".")[0], 10);

  // Must be Node 24+
  if (majorVersion < 24) {
    return false;
  }

  // Check if this is a stable release (not RC, alpha, beta)
  // Pre-release versions contain hyphens like "24.0.0-rc.1"
  /* istanbul ignore next 3 - only reachable on Node 24+ */
  if (versionStr.includes("-")) {
    return false;
  }

  /* istanbul ignore next - only reachable on Node 24+ */
  return true;
}

/**
 * Gets the detected runtime type.
 *
 * Returns one of:
 * - 'deno': Running in Deno runtime
 * - 'bun': Running in Bun runtime
 * - 'node': Running in Node.js (any version)
 * - 'unknown': Unable to detect runtime
 *
 * @function getRuntime
 * @returns {RuntimeType} The detected runtime identifier
 *
 * @example
 * const runtime = getRuntime()
 * switch (runtime) {
 *     case 'deno':
 *         console.log('Deno detected')
 *         break
 *     case 'bun':
 *         console.log('Bun detected')
 *         break
 *     case 'node':
 *         console.log('Node.js version:', process.versions.node)
 *         break
 *     default:
 *         console.log('Unknown runtime')
 * }
 */
function getRuntime() {
  if (isDeno()) return "deno";
  if (isBun()) return "bun";
  if (typeof process !== "undefined" && process.versions?.node) return "node";
  /* istanbul ignore next - only reachable in non-Node/Bun/Deno environments */
  return "unknown";
}

/**
 * Gets the WebSocket provider based on runtime capabilities.
 *
 * This function detects the current runtime and returns the most appropriate
 * WebSocket implementation:
 *
 * 1. **Deno**: Returns `DenoWebSocketServer` adapter
 * 2. **Bun**: Returns `BunWebSocketServer` adapter
 * 3. **Node.js 24+**: Attempts to load native `node:ws` module
 * 4. **Fallback**: Returns our RFC 6455 compliant polyfill
 *
 * The returned `WebSocketServer` constructor is compatible with the `ws`
 * library API, allowing seamless integration with existing code.
 *
 * @function getWebSocketProvider
 * @returns {WebSocketProvider} Provider object with type, WebSocketServer, and runtime
 *
 * @example
 * const { type, WebSocketServer, runtime } = getWebSocketProvider()
 *
 * console.log(`Runtime: ${runtime}, Provider: ${type}`)
 *
 * // Create a WebSocket server with noServer mode
 * const wss = new WebSocketServer({ noServer: true })
 *
 * // Handle HTTP upgrade requests
 * server.on('upgrade', (req, socket, head) => {
 *     wss.handleUpgrade(req, socket, head, (ws) => {
 *         wss.emit('connection', ws, req)
 *     })
 * })
 *
 * @example
 * // Conditional logic based on provider type
 * const provider = getWebSocketProvider()
 *
 * if (provider.type === 'polyfill') {
 *     console.log('Using polyfill - consider upgrading to Node.js 24+')
 * }
 */
function getWebSocketProvider() {
  const runtime = getRuntime();

  // 1. Check for Deno runtime
  if (runtime === "deno") {
    try {
      const { DenoWebSocketServer } = require("./ws/adapters/deno");
      return {
        type: "deno-native",
        WebSocketServer: DenoWebSocketServer,
        runtime,
      };
    } catch {
      // Adapter not available, fall through to polyfill
    }
  }

  // 2. Check for Bun runtime
  if (runtime === "bun") {
    try {
      const { BunWebSocketServer } = require("./ws/adapters/bun");
      return {
        type: "bun-native",
        WebSocketServer: BunWebSocketServer,
        runtime,
      };
    } catch {
      // Adapter not available, fall through to polyfill
    }
  }

  // 3. Try Node.js 24+ native WebSocketServer
  /* istanbul ignore next 9 - only reachable on Node 24+ with native WebSocket */
  if (isNode24Stable()) {
    try {
      const { WebSocketServer } = require("node:ws");
      if (WebSocketServer) {
        return { type: "node-native", WebSocketServer, runtime };
      }
    } catch {
      // node:ws not available, fall through to polyfill
    }
  }

  // 4. Fall back to our RFC 6455 compliant polyfill
  const { WebSocketServer } = require("./ws/index");
  return { type: "polyfill", WebSocketServer, runtime };
}

/**
 * Cached WebSocket provider instance.
 * Populated on first call to getCachedProvider().
 *
 * @private
 * @type {WebSocketProvider|null}
 */
let cachedProvider = null;

/**
 * Gets the cached WebSocket provider.
 *
 * This function caches the provider after first detection to ensure
 * consistent behavior throughout the application lifecycle. The same
 * provider is returned on subsequent calls.
 *
 * This is the primary export and should be used instead of calling
 * getWebSocketProvider() directly unless you need to force re-detection.
 *
 * @function getCachedProvider
 * @returns {WebSocketProvider} Cached provider object
 *
 * @example
 * // Multiple calls return the same provider instance
 * const provider1 = getWebSocketProvider()
 * const provider2 = getWebSocketProvider()
 * console.log(provider1 === provider2) // true
 */
function getCachedProvider() {
  if (!cachedProvider) {
    cachedProvider = getWebSocketProvider();
  }
  return cachedProvider;
}

module.exports = {
  /**
   * Get the cached WebSocket provider (recommended).
   * Returns the same provider instance on subsequent calls.
   * @function
   */
  getWebSocketProvider: getCachedProvider,

  /**
   * Get the detected runtime type.
   * @function
   */
  getRuntime,

  /**
   * Check if running in Deno.
   * @function
   */
  isDeno,

  /**
   * Check if running in Bun.
   * @function
   */
  isBun,

  /**
   * Check if running on Node.js 24+ stable.
   * @function
   */
  isNode24Stable,

  /**
   * Set runtime override for testing purposes.
   * @function
   * @private
   */
  _setRuntimeOverride,

  /**
   * Get current runtime override (for testing).
   * @function
   * @private
   */
  _getRuntimeOverride,
};
