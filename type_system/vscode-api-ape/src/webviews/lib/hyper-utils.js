/**
 * @fileoverview VS Code API Bridge for hyper-element components
 * Provides reactive state management that integrates with VS Code's postMessage API
 */

/**
 * Creates a VS Code bridge for hyper-element components
 * @param {Function} attachStore - The attachStore function from hyper-element's setup()
 * @param {Object} initialState - Initial state object
 * @param {Object} options - Configuration options
 * @param {Function} options.onMessage - Custom message handler (receives msg, state, onStoreChange)
 * @returns {{ vscode: Object, state: Object, onStoreChange: Function, postMessage: Function }}
 */
function createVsCodeBridge(attachStore, initialState, options = {}) {
  // Acquire VS Code API (only works in VS Code webview context)
  const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

  // Create mutable state object
  const state = { ...initialState };

  // Attach store for reactive updates
  const onStoreChange = attachStore(() => state);

  /** @param {MessageEvent} event - VS Code message event */
  const handleMessage = (event) => {
    const msg = event.data;

    // Allow custom message handling
    if (options.onMessage) {
      options.onMessage(msg, state, onStoreChange);
    }

    // Default: handle updateState command
    if (msg.command === 'updateState' && msg.state) {
      Object.assign(state, msg.state);
      onStoreChange();
    }
  };

  // Listen for VS Code messages
  window.addEventListener('message', handleMessage);

  // Signal ready to provider
  if (vscode) {
    vscode.postMessage({ command: 'ready' });
  }

  /** @param {Object} message - Message to send to VS Code */
  const postMessage = (message) => {
    if (vscode) {
      vscode.postMessage(message);
    } else {
      console.warn('[hyper-utils] No VS Code API available, message not sent:', message);
    }
  };

  return {
    vscode,
    state,
    onStoreChange,
    postMessage,
    // Cleanup function for disconnectedCallback
    cleanup: () => window.removeEventListener('message', handleMessage)
  };
}

/**
 * Escapes HTML entities for safe rendering
 * Note: hyper-element's Html tagged template already handles this,
 * but this utility is useful for cases where raw strings are needed
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Creates a debounced version of a function
 * Useful for search inputs and other rapid-fire events
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(fn, delay = 300) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Groups an array of items by a key function
 * Useful for organizing endpoints by namespace
 * @param {Array} items - Array to group
 * @param {Function} keyFn - Function that returns the group key for an item
 * @returns {Object} Object with keys as groups and values as arrays
 */
function groupBy(items, keyFn) {
  return items.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

// Export for both ES modules and global scope (VS Code webview)
if (typeof window !== 'undefined') {
  window.hyperUtils = {
    createVsCodeBridge,
    escapeHtml,
    debounce,
    groupBy
  };
}
