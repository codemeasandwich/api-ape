/**
 * @fileoverview Client Manager for api-ape Testing
 *
 * This module manages simulated browser clients for testing api-ape.
 * It uses direct WebSocket connections (via 'ws' package) to communicate
 * with api-ape servers, implementing the same protocol as the browser client.
 *
 * Features:
 * - Creates isolated client instances with direct WebSocket connections
 * - Implements api-ape message protocol (JSS encoding, query IDs)
 * - Manages client lifecycle (connect, disconnect, cleanup)
 * - Provides convenient API for sending/receiving messages
 * - Supports both WebSocket and HTTP polling transports
 * - Tracks received broadcasts for assertions
 *
 * @module simulator/harness/client-manager
 *
 * @example
 * const { ClientManager } = require('./client-manager')
 *
 * const manager = new ClientManager()
 *
 * // Create a client connected to a server
 * const client = await manager.create({ url: 'http://localhost:4001' })
 *
 * // Make API calls
 * const result = await client.call('echo', { message: 'Hello!' })
 *
 * // Listen for broadcasts
 * client.on('chat', (msg) => console.log(msg))
 *
 * // Wait for specific broadcast
 * const msg = await client.waitFor('notification')
 *
 * // Cleanup
 * await manager.closeAll()
 */

const { EventEmitter } = require("events");
const WebSocket = require("ws");
const http = require("http");
const https = require("https");

// Load JSS from api-ape utils for message encoding/decoding
const jss = require("../../utils/jss");

// Load messageHash to generate queryIds the same way the server does
const messageHash = require("../../utils/messageHash");

/**
 * Manages multiple simulated browser clients for testing
 */
class ClientManager extends EventEmitter {
  /**
   * Create a new ClientManager
   * @param {Object} options - Configuration options
   * @param {number} [options.connectTimeout=5000] - Default connection timeout
   */
  constructor(options = {}) {
    super();

    /**
     * Default connection timeout (short for local/virtual testing)
     * @type {number}
     */
    this.connectTimeout = options.connectTimeout || 500;

    /**
     * Map of active clients by ID
     * @type {Map<string, ClientInstance>}
     * @private
     */
    this._clients = new Map();

    /**
     * Counter for generating unique client IDs
     * @type {number}
     * @private
     */
    this._idCounter = 0;
  }

  /**
   * Create and connect a new client
   *
   * @param {Object} options - Client configuration
   * @param {string} options.url - Server URL to connect to
   * @param {string} [options.transport='websocket'] - Transport mode: 'websocket' or 'polling'
   * @param {string} [options.id] - Custom client ID (auto-generated if not provided)
   * @param {number} [options.connectTimeout] - Connection timeout override
   * @param {Object} [options.cookies] - Cookies to set before connecting
   * @param {string} [options.apiPath='api'] - API path (default 'api')
   * @returns {Promise<ClientInstance>} The created client instance
   *
   * @example
   * const client = await manager.create({
   *   url: 'http://localhost:4001',
   *   transport: 'websocket',
   *   cookies: { sessionId: 'test-session' }
   * })
   */
  async create(options = {}) {
    if (!options.url) {
      throw new Error("Client requires a URL to connect to");
    }

    // Generate client ID
    const id = options.id || `client-${++this._idCounter}`;

    // Create the client instance
    const instance = new ClientInstance({
      id,
      url: options.url,
      transport: options.transport || "websocket",
      connectTimeout: options.connectTimeout || this.connectTimeout,
      cookies: options.cookies || {},
      apiPath: options.apiPath || "api",
      manager: this,
    });

    // Connect the client
    await instance.connect();

    // Track the client
    this._clients.set(id, instance);
    this.emit("client:created", instance);

    return instance;
  }

  /**
   * Create multiple clients connected to the same server
   * @param {string} url - Server URL
   * @param {number} count - Number of clients to create
   * @param {Object} [options] - Additional options for each client
   * @returns {Promise<ClientInstance[]>}
   */
  async createMany(url, count, options = {}) {
    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(this.create({ url, ...options }));
    }
    return Promise.all(promises);
  }

  /**
   * Get a client by ID
   * @param {string} id - The client ID
   * @returns {ClientInstance|undefined}
   */
  get(id) {
    return this._clients.get(id);
  }

  /**
   * Get all active clients
   * @returns {ClientInstance[]}
   */
  getAll() {
    return [...this._clients.values()];
  }

  /**
   * Close a specific client
   * @param {string} id - The client ID
   * @returns {Promise<void>}
   */
  async close(id) {
    const client = this._clients.get(id);
    if (client) {
      await client.disconnect();
      this._clients.delete(id);
      this.emit("client:closed", id);
    }
  }

  /**
   * Close all clients (for test cleanup)
   * @returns {Promise<void>}
   */
  async closeAll() {
    const closePromises = [];
    for (const [id, client] of this._clients) {
      closePromises.push(
        client
          .disconnect()
          .then(() => {
            this._clients.delete(id);
            this.emit("client:closed", id);
          })
          .catch(() => {
            // Ignore errors during cleanup
            this._clients.delete(id);
          }),
      );
    }
    await Promise.all(closePromises);
  }

  /**
   * Get the count of active clients
   * @returns {number}
   */
  get count() {
    return this._clients.size;
  }

  /**
   * Reset the manager (close all clients and reset state)
   * @returns {Promise<void>}
   */
  async reset() {
    await this.closeAll();
    this._idCounter = 0;
  }
}

/**
 * Wrapper around a single api-ape client connection
 */
class ClientInstance extends EventEmitter {
  /**
   * Create a ClientInstance
   * @param {Object} config - Instance configuration
   * @private
   */
  constructor(config) {
    super();

    /**
     * Unique client identifier
     * @type {string}
     */
    this.id = config.id;

    /**
     * Server URL this client connects to
     * @type {string}
     */
    this.url = config.url;

    /**
     * API path on the server
     * @type {string}
     */
    this.apiPath = config.apiPath;

    /**
     * Configured transport mode
     * @type {string}
     */
    this.transportMode = config.transport;

    /**
     * Connection timeout
     * @type {number}
     * @private
     */
    this._connectTimeout = config.connectTimeout;

    /**
     * Cookies to send with requests
     * @type {Object}
     * @private
     */
    this._cookies = config.cookies;

    /**
     * Reference to the client manager
     * @type {ClientManager}
     * @private
     */
    this._manager = config.manager;

    /**
     * WebSocket instance
     * @type {WebSocket|null}
     * @private
     */
    this._ws = null;

    /**
     * Current connection state
     * @type {string}
     */
    this.state = "disconnected";

    /**
     * Current transport type (after connection)
     * @type {string|null}
     */
    this.transport = null;

    /**
     * Whether the client is connected
     * @type {boolean}
     */
    this.connected = false;

    /**
     * Buffer of received broadcasts
     * @type {Array<{type: string, data: any, err: any, timestamp: number}>}
     */
    this.receivedMessages = [];

    /**
     * Map of pending request promises by query ID
     * @type {Map<string, {resolve: Function, reject: Function, timeout: NodeJS.Timeout}>}
     * @private
     */
    this._pendingRequests = new Map();

    /**
     * Map of pending waitFor promises by type
     * @type {Map<string, {resolve: Function, reject: Function, timeout: NodeJS.Timeout}>}
     * @private
     */
    this._waiters = new Map();

    /**
     * Message type handlers
     * @type {Map<string, Set<Function>>}
     * @private
     */
    this._handlers = new Map();

    /**
     * HTTP polling state (for polling transport)
     * @type {Object|null}
     * @private
     */
    this._polling = null;
  }

  /**
   * Get the WebSocket URL for the server
   * @returns {string}
   * @private
   */
  _getWsUrl() {
    const parsed = new URL(this.url);
    const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${parsed.host}/${this.apiPath}/ape`;
  }

  /**
   * Get the polling URL for the server
   * @returns {string}
   * @private
   */
  _getPollUrl() {
    const parsed = new URL(this.url);
    return `${parsed.origin}/${this.apiPath}/ape/poll`;
  }

  /**
   * Build cookie header string
   * @returns {string}
   * @private
   */
  _getCookieHeader() {
    return Object.entries(this._cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

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
  }

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

      this._ws.on("open", () => {
        clearTimeout(timeout);
        this.connected = true;
        this.state = "connected";
        this.transport = "websocket";
        this.emit("connected");
        resolve();
      });

      this._ws.on("message", (data) => {
        this._handleMessage(data.toString());
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
  }

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
  }

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

  /**
   * Handle an incoming message
   * @param {string} rawData - Raw message string
   * @private
   */
  _handleMessage(rawData) {
    try {
      const msg = jss.parse(rawData);
      const { type, data, err, queryId } = msg;

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
      super.emit("message", { type, data, err });

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
  }

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
  }

  /**
   * Call an API endpoint
   * @param {string} endpoint - The endpoint path (e.g., 'echo', 'users/profile')
   * @param {any} [data] - Data to send
   * @param {number} [timeout=1000] - Request timeout (short for local testing)
   * @returns {Promise<any>} The response from the server
   *
   * @example
   * const result = await client.call('echo', { message: 'Hello!' })
   * const profile = await client.call('users/profile', { id: 123 })
   */
  async call(endpoint, data, timeout = 1000) {
    if (!this.connected) {
      throw new Error("Client not connected");
    }

    // Normalize endpoint path
    const type = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;

    // Build the message the same way the server expects
    const message = jss.stringify({ type, data });

    // Generate queryId from message hash - this is how the server does it
    const queryId = messageHash(message);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this._pendingRequests.delete(queryId);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      this._pendingRequests.set(queryId, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      // Send the pre-built message directly
      this._sendRaw(message).catch((err) => {
        this._pendingRequests.delete(queryId);
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  /**
   * Register a handler for broadcast messages
   * @param {string} type - Message type to listen for
   * @param {Function} handler - Handler function
   * @returns {ClientInstance} this (for chaining)
   *
   * @example
   * client.on('chat', (msg) => {
   *   console.log('Chat message:', msg.data)
   * })
   */
  on(type, handler) {
    // If it's an EventEmitter event, use parent
    if (
      ["connected", "disconnected", "stateChange", "message", "error"].includes(
        type,
      )
    ) {
      super.on(type, handler);
      return this;
    }

    // Otherwise, register as broadcast handler
    if (!this._handlers.has(type)) {
      this._handlers.set(type, new Set());
    }

    this._handlers.get(type).add(handler);
    return this;
  }

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
  }

  /**
   * Clear the received messages buffer
   */
  clearMessages() {
    this.receivedMessages = [];
  }

  /**
   * Get messages of a specific type from the buffer
   * @param {string} type - Message type
   * @returns {Array<Object>}
   */
  getMessages(type) {
    return this.receivedMessages.filter((m) => m.type === type);
  }

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
  }

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
}

/**
 * Global client manager instance for simple tests
 * @type {ClientManager}
 */
const globalManager = new ClientManager();

/**
 * Create a client using the global manager
 * @param {Object} options - Client options
 * @returns {Promise<ClientInstance>}
 */
async function createClient(options) {
  return globalManager.create(options);
}

/**
 * Close all clients in the global manager
 * @returns {Promise<void>}
 */
async function closeAllClients() {
  return globalManager.closeAll();
}

/**
 * Reset the global client manager
 * @returns {Promise<void>}
 */
async function resetClientManager() {
  return globalManager.reset();
}

module.exports = {
  ClientManager,
  ClientInstance,
  globalManager,
  createClient,
  closeAllClients,
  resetClientManager,
};
