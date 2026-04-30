/**
 * @fileoverview ClientInstance transport methods — URLs, WebSocket, and polling (test harness).
 *
 * Merged onto {@link ClientInstance} via `Object.assign` from {@link module:simulator/harness/client-instance}.
 *
 * @module simulator/harness/client-instance-connect-proto
 */
const WebSocket = require("ws");
const http = require("http");
const https = require("https");

module.exports = {
/**
 * Get the WebSocket URL for the server
 * @returns {string}
 * @private
 */
_getWsUrl() {
  const parsed = new URL(this.url);
  const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  const u = new URL(`${protocol}//${parsed.host}/${this.apiPath}/ape`);
  if (this.serverClientId && this._cookies.sessionId) {
    u.searchParams.set("resume", this.serverClientId);
  }
  return u.toString();
},

/**
 * Get the polling URL for the server
 * @returns {string}
 * @private
 */
_getPollUrl() {
  const parsed = new URL(this.url);
  return `${parsed.origin}/${this.apiPath}/ape/poll`;
},

/**
 * Build cookie header string
 * @returns {string}
 * @private
 */
_getCookieHeader() {
  return Object.entries(this._cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
},

/**
 * Connect to the server
 * @returns {Promise<void>}
 */
async connect() {
  if (this.connected) {
    return;
  }

  this.state = "connecting";

  if (this.transportMode === "polling") {
    await this._connectPolling();
  } else {
    await this._connectWebSocket();
  }
},

/**
 * Connect via WebSocket
 * @returns {Promise<void>}
 * @private
 */
_connectWebSocket() {
  return new Promise((resolve, reject) => {
    const wsUrl = this._getWsUrl();
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `WebSocket connection timeout after ${this._connectTimeout}ms`,
        ),
      );
    }, this._connectTimeout);

    const headers = {};
    const cookieHeader = this._getCookieHeader();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    this._ws = new WebSocket(wsUrl, { headers });

    // Track if we've received the __connected__ message
    let receivedConnected = false;
    let wsOpen = false;

    /**
     * Resolve the harness WebSocket connect promise after TCP open and `__connected__` text seen.
     * @returns {void}
     */
    const checkReady = () => {
      if (wsOpen && receivedConnected) {
        clearTimeout(timeout);
        this.connected = true;
        this.state = "connected";
        this.transport = "websocket";
        this.emit("connected");
        resolve();
      }
    };

    this._ws.on("open", () => {
      wsOpen = true;
      checkReady();
    });

    this._ws.on("message", (data) => {
      const str = data.toString();
      this._handleMessage(str);
      // Check if this is the __connected__ message
      if (!receivedConnected && str.includes("__connected__")) {
        receivedConnected = true;
        checkReady();
      }
    });

    this._ws.on("close", () => {
      this.connected = false;
      this.state = "disconnected";
      this.emit("disconnected");
    });

    this._ws.on("error", (err) => {
      clearTimeout(timeout);
      if (!this.connected) {
        reject(err);
      }
      // Only emit if we have listeners, otherwise ignore
      if (this.listenerCount("error") > 0) {
        this.emit("error", err);
      }
    });
  });
},

/**
 * Connect via HTTP polling
 * @returns {Promise<void>}
 * @private
 */
async _connectPolling() {
  const pollUrl = this._getPollUrl();

  // Start the polling GET request
  this._polling = {
    active: true,
    buffer: "",
  };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Polling connection timeout after ${this._connectTimeout}ms`,
        ),
      );
    }, this._connectTimeout);

    const parsed = new URL(pollUrl);
    const httpModule = parsed.protocol === "https:" ? https : http;

    const headers = {
      Accept: "text/event-stream",
    };
    const cookieHeader = this._getCookieHeader();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const req = httpModule.request(
      pollUrl,
      {
        method: "GET",
        headers,
      },
      (res) => {
        // Store any cookies from response
        const setCookie = res.headers["set-cookie"];
        if (setCookie) {
          for (const cookie of setCookie) {
            const [pair] = cookie.split(";");
            const [name, value] = pair.split("=");
            this._cookies[name.trim()] = value?.trim();
          }
        }

        clearTimeout(timeout);
        this.connected = true;
        this.state = "connected";
        this.transport = "polling";
        this.emit("connected");
        resolve();

        res.on("data", (chunk) => {
          this._polling.buffer += chunk.toString();

          // Parse SSE-style messages (data: {...}\n\n)
          const lines = this._polling.buffer.split("\n\n");
          this._polling.buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6);
              if (jsonStr && jsonStr !== ":ping") {
                this._handleMessage(jsonStr);
              }
            }
          }
        });

        res.on("end", () => {
          if (this._polling?.active) {
            // Reconnect polling
            this._reconnectPolling();
          }
        });
      },
    );

    req.on("error", (err) => {
      clearTimeout(timeout);
      if (!this.connected) {
        reject(err);
      }
    });

    req.end();
    this._polling.request = req;
  });
},

/**
 * Reconnect polling after stream ends
 * @private
 */
_reconnectPolling() {
  if (!this._polling?.active) return;

  setTimeout(() => {
    if (this._polling?.active) {
      this._connectPolling().catch(() => {
        // Ignore reconnection errors
      });
    }
  }, 100);
}

};
