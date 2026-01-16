/**
 * @fileoverview Server-Side Plugin Hooks for JSS
 *
 * This module provides the integration layer between JSS custom plugins
 * and the server's send/receive handlers. It processes data through plugin
 * lifecycle hooks (onSend/onReceive) to handle external resources like
 * file transfers, HTTP uploads, etc.
 *
 * ## Architecture
 *
 * ```
 * Controller Response                     Client Message
 *        │                                       │
 *        ▼                                       ▼
 * ┌─────────────────┐                   ┌─────────────────┐
 * │ processPluginSend │                 │ processPluginReceive │
 * │  - Check plugins │                  │  - Check plugins │
 * │  - Call onSend   │                  │  - Call onReceive │
 * │  - Tag keys      │                  │  - Resolve data   │
 * └─────────────────┘                   └─────────────────┘
 *        │                                       │
 *        ▼                                       ▼
 *    JSS Encode                             Controller
 * ```
 *
 * @module server/socket/pluginHooks
 * @see {@link module:utils/jss/plugins} for plugin registration
 * @see {@link module:server/socket/send} for send handler
 * @see {@link module:server/socket/receive} for receive handler
 */

const { getAllPlugins } = require("../../utils/jss/plugins");

/**
 * Check if a value is a JSS-native type that shouldn't be processed by plugins
 *
 * @param {any} value - Value to check
 * @returns {boolean} True if value is a JSS-native type
 * @private
 */
function isJssNativeType(value) {
  return (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof Error
  );
}

/**
 * Process data through plugin onSend hooks before JSS encoding
 *
 * Traverses the data structure and for each value:
 * 1. Checks if any plugin's `check` function matches
 * 2. If matched and plugin has `onSend`, calls it to handle external resources
 * 3. Returns the processed data with tagged keys for matched values
 *
 * @param {any} data - Data to process
 * @param {Object} context - Runtime context
 * @param {string} context.queryId - Message/query identifier
 * @param {string} context.clientId - Connected client ID
 * @param {Object} [context.fileTransfer] - FileTransferManager instance
 * @param {string} [path=''] - Current dot-notation path in the object
 * @returns {{data: any, cleanups: Function[], binaryCount: number}}
 *          Processed data, cleanup callbacks, and count of binary entries
 *
 * @example
 * const { data, cleanups, binaryCount } = processPluginSend(
 *   { image: buffer },
 *   { queryId: 'q123', clientId: 'c456', fileTransfer: manager }
 * )
 * // data = { 'image<!L>': 'hash123' }
 * // binaryCount = 1
 */
function processPluginSend(data, context, path = "") {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return { data, cleanups: [], binaryCount: 0 };
  }

  // Skip JSS-native types (handled by JSS encoding)
  if (isJssNativeType(data)) {
    return { data, cleanups: [], binaryCount: 0 };
  }

  const cleanups = [];
  let binaryCount = 0;

  // Check each plugin
  for (const [tag, plugin] of getAllPlugins()) {
    const key = path ? path.split(".").pop() : "root";
    if (plugin.check(key, data)) {
      // Plugin matched - check for onSend hook
      if (plugin.onSend) {
        const pathArray = path ? path.split(".") : [];
        const result = plugin.onSend(pathArray, key, data, context);

        if (result.cleanup) {
          cleanups.push(result.cleanup);
        }

        return {
          data: { [`__ape_plugin_${tag}__`]: result.replace },
          cleanups,
          binaryCount: 1,
          tag,
        };
      }

      // No onSend hook, but plugin matched - just mark for later
      return { data, cleanups, binaryCount: 0, tag };
    }
  }

  // Handle arrays - process each element recursively
  if (Array.isArray(data)) {
    const processedArray = [];
    for (let i = 0; i < data.length; i++) {
      const itemPath = path ? `${path}.${i}` : String(i);
      const result = processPluginSend(data[i], context, itemPath);
      processedArray.push(result.data);
      cleanups.push(...result.cleanups);
      binaryCount += result.binaryCount;
    }
    return { data: processedArray, cleanups, binaryCount };
  }

  // Handle plain objects - process each property recursively
  if (typeof data === "object") {
    const processedObj = {};

    for (const key of Object.keys(data)) {
      // Pass through F-tagged values unchanged (client-to-client sharing)
      if (key.endsWith("<!F>")) {
        processedObj[key] = data[key];
        continue;
      }

      const itemPath = path ? `${path}.${key}` : key;
      const result = processPluginSend(data[key], context, itemPath);

      // If plugin with onSend handled this, apply tag to key
      if (result.tag && result.data?.[`__ape_plugin_${result.tag}__`]) {
        processedObj[`${key}<!${result.tag}>`] =
          result.data[`__ape_plugin_${result.tag}__`];
      } else {
        processedObj[key] = result.data;
      }

      cleanups.push(...result.cleanups);
      binaryCount += result.binaryCount;
    }

    return { data: processedObj, cleanups, binaryCount };
  }

  // Primitive value - return as-is
  return { data, cleanups, binaryCount };
}

/**
 * Find all plugin-tagged keys in raw parsed data
 *
 * Used to detect tags BEFORE JSS decoding, since JSS may strip unknown tags.
 * Returns information about each tagged key for processing.
 *
 * @param {Object} obj - Raw parsed JSON object
 * @param {string} [path=''] - Current path prefix
 * @returns {Array<{path: string, tag: string, hash: any, originalKey: string}>}
 *
 * @example
 * const tags = findPluginTags({ 'file<!B>': 'hash123', name: 'doc.pdf' })
 * // [{ path: 'file', tag: 'B', hash: 'hash123', originalKey: 'file<!B>' }]
 */
function findPluginTags(obj, path = "") {
  const tags = [];

  if (obj === null || obj === undefined || typeof obj !== "object") {
    return tags;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      tags.push(...findPluginTags(obj[i], path ? `${path}.${i}` : String(i)));
    }
    return tags;
  }

  // Handle objects
  for (const key of Object.keys(obj)) {
    // Check for tag pattern: name<!X>
    const match = key.match(/^(.+)<!([A-Z])>$/);

    if (match) {
      const [, name, tag] = match;
      tags.push({
        path: path ? `${path}.${name}` : name,
        tag,
        hash: obj[key],
        originalKey: key,
      });
    } else {
      // Recurse into value
      tags.push(...findPluginTags(obj[key], path ? `${path}.${key}` : key));
    }
  }

  return tags;
}

/**
 * Clean plugin tags from object keys
 *
 * Transforms keys like `"file<!B>"` to `"file"` throughout the object tree.
 *
 * @param {Object} obj - Object with tagged keys
 * @returns {Object} New object with tags removed from keys
 *
 * @example
 * cleanPluginTags({ 'file<!B>': 'hash', name: 'doc' })
 * // { file: 'hash', name: 'doc' }
 */
function cleanPluginTags(obj) {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanPluginTags);
  }

  const cleaned = {};
  for (const key of Object.keys(obj)) {
    const match = key.match(/^(.+)<!([A-Z])>$/);
    if (match) {
      cleaned[match[1]] = obj[key];
    } else {
      cleaned[key] = cleanPluginTags(obj[key]);
    }
  }

  return cleaned;
}

/**
 * Set a value at a dot-notation path in an object
 *
 * @param {Object} obj - Object to modify (mutated)
 * @param {string} path - Dot-notation path
 * @param {any} value - Value to set
 *
 * @example
 * const obj = { user: { profile: {} } }
 * setValueAtPath(obj, 'user.profile.avatar', buffer)
 * // obj.user.profile.avatar === buffer
 */
function setValueAtPath(obj, path, value) {
  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Process data through plugin onReceive hooks after JSS decoding
 *
 * For each plugin-tagged value found in the raw data:
 * 1. If the plugin has `onReceive`, call it to resolve external resources
 * 2. Set the resolved value at the appropriate path
 *
 * @param {any} data - JSS-decoded data
 * @param {Object} rawData - Raw JSON-parsed data (for tag detection)
 * @param {Object} context - Runtime context
 * @param {string} context.queryId - Message/query identifier
 * @param {string} context.clientId - Connected client ID
 * @param {Object} [context.fileTransfer] - FileTransferManager instance
 * @returns {Promise<any>} Processed data with resolved external resources
 *
 * @example
 * const processed = await processPluginReceive(
 *   { file: 'hash123', name: 'doc.pdf' },
 *   { 'file<!B>': 'hash123', name: 'doc.pdf' },
 *   { queryId: 'q123', clientId: 'c456', fileTransfer: manager }
 * )
 * // processed.file = Buffer(...)
 */
async function processPluginReceive(data, rawData, context) {
  const { getAllPlugins } = require("../../utils/jss/plugins");

  // Find all plugin tags in raw data
  const pluginTags = findPluginTags(rawData);

  if (pluginTags.length === 0) {
    return data;
  }

  // Clean the tags from data keys
  const cleanedData = cleanPluginTags(data);

  // Process each tagged value
  await Promise.all(
    pluginTags.map(async ({ path, tag, hash }) => {
      const plugin = getAllPlugins().get(tag);

      if (plugin && plugin.onReceive) {
        const pathArray = path.split(".");
        const key = pathArray[pathArray.length - 1];
        const resolvedValue = await plugin.onReceive(
          pathArray,
          key,
          hash,
          context,
        );
        setValueAtPath(cleanedData, path, resolvedValue);
      }
    }),
  );

  return cleanedData;
}

module.exports = {
  processPluginSend,
  processPluginReceive,
  findPluginTags,
  cleanPluginTags,
  setValueAtPath,
};
