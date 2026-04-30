/**
 * @fileoverview ClientInstance lifecycle — handlers, waitFor, disconnect (test harness).
 *
 * @module simulator/harness/client-instance-lifecycle-proto
 */
const WebSocket = require("ws");
const { EventEmitter } = require("events");

module.exports = {
/**
 * Register an EventEmitter listener for core harness events, or a typed broadcast handler.
 *
 * Domain: scenarios subscribe to `connected` / `message` via EventEmitter, or to arbitrary
 * server push types via `_handlers` — both paths are supported without splitting the API.
 *
 * Technical: known names delegate to `EventEmitter.prototype.on`; others append to the
 * `Set` stored under `type` in `_handlers`. Returns `this` for chaining.
 *
 * @param {string} type - Event name (`connected`, `disconnected`, …) or broadcast type
 * @param {Function} handler - Callback invoked with `{ type, data, err }` for broadcasts
 * @returns {object} This harness client instance for fluent chaining
 */
on(type, handler) {
  // If it's an EventEmitter event, use parent
  if (
    ["connected", "disconnected", "stateChange", "message", "error"].includes(
      type,
    )
  ) {
    EventEmitter.prototype.on.call(this, type, handler);
    return this;
  }

  // Otherwise, register as broadcast handler
  if (!this._handlers.has(type)) {
    this._handlers.set(type, new Set());
  }

  this._handlers.get(type).add(handler);
  return this;
},

/**
 * Wait for a specific broadcast message type
 * @param {string} type - Message type to wait for
 * @param {number} [timeout=500] - Timeout in milliseconds (short for local testing)
 * @returns {Promise<Object>} The received message
 *
 * @example
 * const welcome = await client.waitFor('welcome')
 * console.log(welcome.data.message)
 */
waitFor(type, timeout = 500) {
  return new Promise((resolve, reject) => {
    // Check if we already have this message in buffer
    const existingIdx = this.receivedMessages.findIndex(
      (m) => m.type === type,
    );
    if (existingIdx !== -1) {
      // Remove from buffer and return
      const existing = this.receivedMessages.splice(existingIdx, 1)[0];
      resolve({ type, data: existing.data, err: existing.err });
      return;
    }

    // Set up waiter
    const timeoutId = setTimeout(() => {
      this._waiters.delete(type);
      reject(
        new Error(`Timeout waiting for '${type}' message after ${timeout}ms`),
      );
    }, timeout);

    this._waiters.set(type, {
      resolve,
      reject,
      timeout: timeoutId,
    });
  });
},

/**
 * Clear the received messages buffer
 */
clearMessages() {
  this.receivedMessages = [];
},

/**
 * Get messages of a specific type from the buffer
 * @param {string} type - Message type
 * @returns {Array<Object>}
 */
getMessages(type) {
  return this.receivedMessages.filter((m) => m.type === type);
},

/**
 * Disconnect from the server
 * @returns {Promise<void>}
 */
async disconnect() {
  if (!this.connected && this.state === "disconnected") {
    return;
  }

  // Clear pending requests
  for (const [queryId, pending] of this._pendingRequests) {
    clearTimeout(pending.timeout);
    pending.reject(new Error("Client disconnected"));
  }
  this._pendingRequests.clear();

  // Clear waiters
  for (const [type, waiter] of this._waiters) {
    clearTimeout(waiter.timeout);
    waiter.reject(new Error("Client disconnected"));
  }
  this._waiters.clear();

  // Close WebSocket gracefully
  if (this._ws) {
    try {
      // Remove listeners first to avoid error events during close
      this._ws.removeAllListeners();
      if (this._ws.readyState === WebSocket.OPEN) {
        this._ws.close(1000, "Client disconnecting");
      } else {
        this._ws.terminate?.();
      }
    } catch (e) {
      // Ignore close errors
    }
    this._ws = null;
  }

  // Stop polling
  if (this._polling) {
    this._polling.active = false;
    if (this._polling.request) {
      this._polling.request.destroy();
    }
    this._polling = null;
  }

  this.connected = false;
  this.state = "disconnected";
  this.transport = null;

  this.emit("disconnected");
},

/**
 * Get client info for debugging
 * @returns {Object}
 */
getInfo() {
  return {
    id: this.id,
    url: this.url,
    state: this.state,
    transport: this.transport,
    connected: this.connected,
    messageCount: this.receivedMessages.length,
  };
}

};
