/**
 * @fileoverview ClientInstance message parsing and raw send (test harness).
 *
 * @module simulator/harness/client-instance-messaging-proto
 */
const jss = require("../../utils/jss");
const http = require("http");
const https = require("https");
const { EventEmitter } = require("events");

module.exports = {
/**
 * Parse one inbound JSS frame from WebSocket or long-polling and route side effects.
 *
 * Domain: drives observable harness behaviour — RPC latency, broadcast buffering, and
 * cookie/session capture from `__connected__` — everything integration tests assert on.
 *
 * Technical: `jss.parse` → match `queryId` against `_pendingRequests` for RPC replies;
 * otherwise push to `receivedMessages`, emit `message`, fan out `_handlers`, resolve `_waiters`.
 * Parse failures are logged and swallowed so one bad frame does not tear down the client.
 *
 * @param {string} rawData - Serialized JSON message from the wire
 * @returns {void}
 */
_handleMessage(rawData) {
  try {
    const msg = jss.parse(rawData);
    const { type, data, err, queryId } = msg;

    // Capture server-assigned clientId from connection acknowledgment
    if (type === "__connected__" && data && data.clientId) {
      this.serverClientId = data.clientId;
    }
    if (type === "__connected__" && data && data.sessionId) {
      this._cookies.sessionId = data.sessionId;
    }

    // Check if this is a response to a pending request
    if (queryId && this._pendingRequests.has(queryId)) {
      const pending = this._pendingRequests.get(queryId);
      this._pendingRequests.delete(queryId);
      clearTimeout(pending.timeout);

      if (err) {
        pending.reject(
          new Error(
            typeof err === "string" ? err : err.message || "Request failed",
          ),
        );
      } else {
        pending.resolve(data);
      }
      return;
    }

    // This is a broadcast/push message
    this.receivedMessages.push({
      type,
      data,
      err,
      timestamp: Date.now(),
    });

    // Emit to EventEmitter listeners
    EventEmitter.prototype.emit.call(this, "message", { type, data, err });

    // Call type-specific handlers
    const handlers = this._handlers.get(type);
    if (handlers) {
      handlers.forEach((handler) => handler({ type, data, err }));
    }

    // Resolve any waiters for this type
    const waiter = this._waiters.get(type);
    if (waiter) {
      this._waiters.delete(type);
      clearTimeout(waiter.timeout);
      if (err) {
        waiter.reject(
          new Error(typeof err === "string" ? err : err.message || "Error"),
        );
      } else {
        waiter.resolve({ type, data, err });
      }
    }
  } catch (e) {
    console.error("Failed to parse message:", e, rawData);
  }
},

/**
 * Send a raw message string through the current transport
 * @param {string} message - Pre-serialized message
 * @returns {Promise<void>}
 * @private
 */
async _sendRaw(message) {
  if (this.transport === "websocket") {
    this._ws.send(message);
  } else if (this.transport === "polling") {
    // Send via POST
    const pollUrl = this._getPollUrl();
    const parsed = new URL(pollUrl);
    const httpModule = parsed.protocol === "https:" ? https : http;

    const headers = {
      "Content-Type": "application/json",
    };
    const cookieHeader = this._getCookieHeader();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    await new Promise((resolve, reject) => {
      const req = httpModule.request(
        pollUrl,
        {
          method: "POST",
          headers,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            // The response might contain the result directly
            if (body) {
              this._handleMessage(body);
            }
            resolve();
          });
        },
      );

      req.on("error", reject);
      req.write(message);
      req.end();
    });
  }
},

};
