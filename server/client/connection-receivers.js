/**
 * @fileoverview Message Receiver & Subscription Registry for api-ape Client
 *
 * Manages typed and untyped message receivers (subscription handlers)
 * for the WebSocket client. Receivers are callbacks invoked when
 * incoming messages match a specific type or are broadcast to all.
 *
 * Also provides the public subscription API (on, onConnectionChange,
 * isReady, getWs) that connection.js re-exports. These functions
 * depend on connection state — call bindConnection() at startup to
 * inject the live state getters and connect trigger.
 *
 * Extracted from connection.js to keep both modules under the
 * 260-SLOC limit. connection.js handles lifecycle (connect, close,
 * send, error handling); this module handles subscriptions and
 * receiver management (register, remove, buffer, flush, dispatch).
 *
 * @module server/client/connection-receivers
 * @see {@link module:server/client/connection} - Connection lifecycle
 */

// ============================================================================
// RECEIVER STATE
// ============================================================================

/**
 * Array of general message receivers (handles all message types).
 * Invoked for every incoming message regardless of type.
 * @private
 * @type {Array<function({err: *, type: string, data: *}): void>}
 */
const receiverArray = [];

/**
 * Map of typed message receivers keyed by message type.
 * Only invoked when an incoming message matches the key.
 * @private
 * @type {Object<string, Array<function({err: *, type: string, data: *}): void>>}
 */
const ofTypesOb = {};

/**
 * Queue of receivers waiting to be registered when connection opens.
 * Populated by on() when the socket isn't ready yet, flushed by
 * flushBufferedReceivers() in the ws.onopen handler.
 * @private
 * @type {Array<{type: string|null, handler: function}>}
 */
const bufferedReceivers = [];

/**
 * Array of connection state change listeners.
 * @private
 * @type {Array<function(string): void>}
 */
const connectionChangeListeners = [];

/**
 * Current connection state string. Managed by notifyConnectionChange().
 * Tracks the last state to deduplicate notifications — listeners are
 * only called when the state actually changes.
 * @private
 * @type {string}
 */
let connectionState = "disconnected";

// ============================================================================
// CONNECTION BINDING
// ============================================================================

/**
 * Late-bound references to connection.js state and functions.
 * Set by bindConnection() at startup. These allow on() and
 * onConnectionChange() to read connection state without
 * creating a circular dependency.
 * @private
 */
let _connState = {
  getReady: () => false,
  getServerUrl: () => null,
  getWs: () => null,
  triggerConnect: () => {},
};

/**
 * Injects connection state references from connection.js.
 * Must be called once at startup before any on() calls.
 * Uses late binding to avoid circular require between
 * connection.js and this module.
 *
 * @function bindConnection
 * @param {Object} refs - Connection state getters and triggers
 * @param {function(): boolean} refs.getReady - Returns true if socket is connected
 * @param {function(): string|null} refs.getServerUrl - Returns the WebSocket URL
 * @param {function(): WebSocket|null} refs.getWs - Returns the WebSocket instance
 * @param {function(): void} refs.triggerConnect - Triggers a connect() if not already connected
 */
function bindConnection(refs) {
  _connState = refs;
}

// ============================================================================
// RECEIVER FUNCTIONS
// ============================================================================

/**
 * Registers a message receiver for a specific type or all messages.
 *
 * @function setOnReceiver
 * @param {string|null} type - Message type to listen for, or null for all
 * @param {function} handler - Callback function for received messages
 */
function setOnReceiver(type, handler) {
  if (type === null) {
    receiverArray.push(handler);
  } else {
    if (!ofTypesOb[type]) ofTypesOb[type] = [];
    ofTypesOb[type].push(handler);
  }
}

/**
 * Removes a previously registered message receiver.
 *
 * Splices the handler from the typed or general receiver array.
 * If the typed array becomes empty after removal, the key is
 * deleted from ofTypesOb to prevent empty-array accumulation.
 *
 * @function removeOnReceiver
 * @param {string|null} type - Message type the handler was registered for
 * @param {function} handler - The exact handler function reference to remove
 */
function removeOnReceiver(type, handler) {
  if (type === null) {
    const idx = receiverArray.indexOf(handler);
    if (idx > -1) receiverArray.splice(idx, 1);
  } else if (ofTypesOb[type]) {
    const idx = ofTypesOb[type].indexOf(handler);
    if (idx > -1) ofTypesOb[type].splice(idx, 1);
    // Clean up empty arrays to prevent key accumulation
    if (ofTypesOb[type].length === 0) delete ofTypesOb[type];
  }
}

/**
 * Adds a receiver to the buffer for later registration.
 * Called by on() when the socket isn't connected yet.
 *
 * @function bufferReceiver
 * @param {string|null} type - Message type, or null for all
 * @param {function} handler - Callback function
 */
function bufferReceiver(type, handler) {
  bufferedReceivers.push({ type, handler });
}

/**
 * Registers all buffered receivers and clears the buffer.
 * Called from ws.onopen when the connection is established.
 *
 * @function flushBufferedReceivers
 */
function flushBufferedReceivers() {
  bufferedReceivers.forEach(({ type, handler }) =>
    setOnReceiver(type, handler),
  );
  bufferedReceivers.length = 0;
}

/**
 * Dispatches a parsed message to all matching receivers.
 * First checks typed receivers (ofTypesOb[type]), then
 * broadcasts to general receivers (receiverArray).
 *
 * @function dispatchToReceivers
 * @param {string} type - The message type
 * @param {*} err - Error value from the message, if any
 * @param {*} data - Data payload from the message
 */
function dispatchToReceivers(type, err, data) {
  // Dispatch to type-specific receivers
  if (ofTypesOb[type]) ofTypesOb[type].forEach((h) => h({ err, type, data }));
  // Dispatch to general receivers
  receiverArray.forEach((h) => h({ err, type, data }));
}

// ============================================================================
// PUBLIC SUBSCRIPTION API
// ============================================================================

/**
 * Subscribes to server-sent events.
 *
 * Returns an unsubscribe function that removes the handler when called.
 * This prevents memory leaks when subscribing in a loop (e.g., per-request
 * streaming channels).
 *
 * @function on
 * @param {string|function} type - Event type to listen for, or handler for all events
 * @param {function} [handler] - Handler function (if type is a string)
 * @returns {function} Unsubscribe function — call to remove the handler
 *
 * @example
 * // Listen for specific event type
 * const unsub = on('notification', (data) => {
 *     console.log('Notification:', data)
 * })
 * // Later: unsub()
 *
 * @example
 * // Listen for all events
 * const unsub = on((event) => {
 *     console.log('Event:', event.type, event.data)
 * })
 * // Later: unsub()
 */
function on(type, handler) {
  // Support on(handler) syntax for listening to all events
  if (typeof type === "function") {
    handler = type;
    type = null;
  }

  // If connected, register immediately
  if (_connState.getReady()) {
    setOnReceiver(type, handler);
  } else {
    // Otherwise, buffer for when connection opens
    bufferReceiver(type, handler);
    // Trigger connection if we have a server URL
    if (_connState.getServerUrl()) _connState.triggerConnect();
  }

  // Return unsubscribe function that removes this specific handler.
  // Safe to call multiple times — indexOf returns -1 on second call.
  return () => removeOnReceiver(type, handler);
}

/**
 * Updates the connection state and notifies all listeners.
 * Only triggers if the state actually changed — deduplicates
 * rapid transitions (e.g. connect→disconnect→connect).
 *
 * @function notifyConnectionChange
 * @param {string} newState - The new ConnectionState value
 */
function notifyConnectionChange(newState) {
  if (connectionState !== newState) {
    connectionState = newState;
    connectionChangeListeners.forEach((fn) => fn(newState));
  }
}

/**
 * Subscribes to connection state changes.
 *
 * The handler is called immediately with the current state,
 * and then again whenever the state changes.
 *
 * @function onConnectionChange
 * @param {function(string): void} handler - Callback receiving ConnectionState values
 * @returns {function(): void} Unsubscribe function
 *
 * @example
 * const unsubscribe = onConnectionChange((state) => {
 *     console.log('Connection state:', state)
 * })
 *
 * // Later, stop listening
 * unsubscribe()
 */
function onConnectionChange(handler) {
  connectionChangeListeners.push(handler);
  // Immediately invoke with current state (owned by this module)
  handler(connectionState);
  // Return unsubscribe function
  return () => {
    const idx = connectionChangeListeners.indexOf(handler);
    if (idx > -1) connectionChangeListeners.splice(idx, 1);
  };
}

/**
 * Checks if the connection is ready to send messages.
 *
 * @function isReady
 * @returns {boolean} True if connected and ready
 */
function isReady() {
  return _connState.getReady();
}

/**
 * Gets the current WebSocket instance.
 * Useful for advanced use cases like accessing readyState directly.
 *
 * @function getWs
 * @returns {WebSocket|null} The WebSocket instance, or null if not connected
 */
function getWs() {
  return _connState.getWs();
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  /** Inject connection state references (call once at startup) */
  bindConnection,
  /** Register a receiver for a type or all messages */
  setOnReceiver,
  /** Remove a previously registered receiver */
  removeOnReceiver,
  /** Buffer a receiver for later registration */
  bufferReceiver,
  /** Flush buffered receivers (call on connect) */
  flushBufferedReceivers,
  /** Dispatch a message to matching receivers */
  dispatchToReceivers,
  /** Subscribe to server events */
  on,
  /** Notify connection state change */
  notifyConnectionChange,
  /** Subscribe to connection state changes */
  onConnectionChange,
  /** Check if connection is ready */
  isReady,
  /** Get WebSocket instance */
  getWs,
};
