/**
 * @fileoverview JSS Plugin Registry
 *
 * This module provides the plugin registration system for JSS (JSON Super Set).
 * It allows developers to register custom type handlers that extend JSS beyond
 * its built-in types (Date, RegExp, Error, etc.).
 *
 * ## Plugin Architecture
 *
 * Plugins are registered with a single-character tag and provide:
 * - `check(key, value)` - Determines if this plugin handles a value
 * - `encode(path, key, value, context)` - Transforms value for serialization
 * - `decode(value, path, context)` - Restores value from serialization
 * - `onSend(path, key, value, context)` - Optional: handles external resources during send
 * - `onReceive(path, key, value, context)` - Optional: handles external resources during receive
 *
 * ## Usage
 *
 * ```javascript
 * const jss = require('./jss')
 *
 * jss.custom('X', {
 *   check: (key, value) => value instanceof CustomType,
 *   encode: (path, key, value, ctx) => value.toSerializable(),
 *   decode: (value, path, ctx) => CustomType.fromSerializable(value)
 * })
 * ```
 *
 * @module utils/jss/plugins
 * @see {@link module:utils/jss} for main JSS module
 */

/**
 * Built-in type tags that cannot be overridden
 * @constant {string[]}
 */
const builtInTags = ["D", "R", "E", "U", "M", "S", "P", "I"];

/**
 * Registry of custom plugins
 * Maps tag character to plugin configuration
 * @type {Map<string, PluginConfig>}
 * @private
 */
const plugins = new Map();

/**
 * @typedef {Object} PluginConfig
 * @property {function(string|number, any): boolean} check - Determines if plugin handles value
 * @property {function(string[], string|number, any, Object): any} encode - Transforms for serialization
 * @property {function(any, string[], Object): any} decode - Restores from serialization
 * @property {function(string[], string|number, any, Object): {replace: any, cleanup?: function}=} onSend - Optional send hook
 * @property {function(string[], string|number, any, Object): Promise<any>=} onReceive - Optional receive hook
 */

/**
 * Register a custom type handler plugin
 *
 * Plugins extend JSS to handle custom types beyond the built-in set.
 * Each plugin is identified by a single-character tag that appears in
 * the serialized format (e.g., `"key<!X>": value`).
 *
 * ## Behavior Rules
 *
 * - **Check gates encode**: The `check` function determines if this plugin
 *   should handle a value. If it returns true, encode is called.
 * - **Error on conflict**: Throws if the tag conflicts with a built-in type
 *   or an already-registered custom plugin.
 *
 * @param {string} tag - Single character tag identifier (e.g., 'X', 'Z')
 * @param {PluginConfig} config - Plugin configuration object
 * @throws {Error} If tag is not a single character
 * @throws {Error} If tag conflicts with built-in type
 * @throws {Error} If tag is already registered
 * @throws {Error} If required functions are missing
 *
 * @example
 * // Register a plugin for a custom Point type
 * register('P', {
 *   check: (key, value) => value instanceof Point,
 *   encode: (path, key, value) => [value.x, value.y],
 *   decode: (value) => new Point(value[0], value[1])
 * })
 *
 * @example
 * // Register a plugin with lifecycle hooks for external resources
 * register('L', {
 *   check: (key, value) => Buffer.isBuffer(value),
 *   encode: (path, key, value) => '__pending__',
 *   decode: (value) => value, // Hash returned as-is
 *   onSend: (path, key, value, ctx) => {
 *     const hash = generateHash(ctx.queryId, path.join('.'))
 *     ctx.fileTransfer.registerDownload(hash, value, 'application/octet-stream', ctx.clientId)
 *     return { replace: hash }
 *   }
 * })
 */
function register(tag, config) {
  // Validate tag format
  if (typeof tag !== "string" || tag.length !== 1) {
    throw new Error(`Tag must be a single character, got: '${tag}'`);
  }

  // Check for built-in tag conflict
  if (builtInTags.includes(tag)) {
    throw new Error(`Tag '${tag}' conflicts with built-in type`);
  }

  // Check for duplicate registration
  if (plugins.has(tag)) {
    throw new Error(`Tag '${tag}' is already registered`);
  }

  // Validate required functions
  if (typeof config.check !== "function") {
    throw new Error("Plugin must provide a 'check' function");
  }
  if (typeof config.encode !== "function") {
    throw new Error("Plugin must provide an 'encode' function");
  }
  if (typeof config.decode !== "function") {
    throw new Error("Plugin must provide a 'decode' function");
  }

  // Validate optional functions if provided
  if (config.onSend !== undefined && typeof config.onSend !== "function") {
    throw new Error("Plugin 'onSend' must be a function if provided");
  }
  if (
    config.onReceive !== undefined &&
    typeof config.onReceive !== "function"
  ) {
    throw new Error("Plugin 'onReceive' must be a function if provided");
  }

  plugins.set(tag, config);
}

/**
 * Get a plugin by its tag
 *
 * @param {string} tag - The tag character to look up
 * @returns {PluginConfig|undefined} The plugin config or undefined if not found
 *
 * @example
 * const plugin = getPlugin('X')
 * if (plugin) {
 *   const decoded = plugin.decode(value, path, context)
 * }
 */
function getPlugin(tag) {
  return plugins.get(tag);
}

/**
 * Get all registered plugins
 *
 * Returns the internal Map for iteration during encoding.
 *
 * @returns {Map<string, PluginConfig>} Map of tag -> plugin config
 *
 * @example
 * for (const [tag, plugin] of getAllPlugins()) {
 *   if (plugin.check(key, value)) {
 *     return [tag, plugin.encode(path, key, value, context)]
 *   }
 * }
 */
function getAllPlugins() {
  return plugins;
}

/**
 * Check if a tag has a registered plugin
 *
 * @param {string} tag - The tag to check
 * @returns {boolean} True if a plugin is registered for this tag
 *
 * @example
 * if (hasPlugin('X')) {
 *   // Handle custom type
 * }
 */
function hasPlugin(tag) {
  return plugins.has(tag);
}

/**
 * Clear all registered plugins
 *
 * Used primarily for testing to reset the registry between tests.
 * Does not affect built-in types.
 *
 * @example
 * beforeEach(() => {
 *   clearPlugins()
 * })
 */
function clearPlugins() {
  plugins.clear();
}

module.exports = {
  register,
  getPlugin,
  getAllPlugins,
  hasPlugin,
  clearPlugins,
  builtInTags,
};
