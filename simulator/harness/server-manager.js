/**
 * @fileoverview Server Manager for api-ape Testing
 *
 * This module manages api-ape server instances for testing purposes.
 * It handles:
 * - Dynamic port allocation to avoid conflicts
 * - Server lifecycle (create, start, stop)
 * - Integration with fake database adapters
 * - Cleanup of all servers after tests
 *
 * @module simulator/harness/server-manager
 *
 * @example
 * const { ServerManager } = require('./server-manager')
 *
 * const manager = new ServerManager()
 *
 * // Create a server
 * const server = await manager.create({
 *   where: 'test-api',
 *   onConnect: (socket, req, send) => {
 *     return { embed: { userId: 'test-user' } }
 *   }
 * })
 *
 * console.log(server.url) // http://localhost:4001
 *
 * // Cleanup
 * await manager.closeAll()
 */

const http = require("http");
const path = require("path");
const { EventEmitter } = require("events");

/**
 * Manages multiple api-ape server instances for testing
 */
class ServerManager extends EventEmitter {
  /**
   * Create a new ServerManager
   * @param {Object} options - Configuration options
   * @param {number} [options.basePort=4000] - Starting port for allocation
   * @param {string} [options.host='localhost'] - Host to bind servers to
   */
  constructor(options = {}) {
    super();

    /**
     * Starting port for dynamic allocation
     * @type {number}
     */
    this.basePort = options.basePort || 4000;

    /**
     * Host to bind servers to
     * @type {string}
     */
    this.host = options.host || "localhost";

    /**
     * Next port to try
     * @type {number}
     * @private
     */
    this._nextPort = this.basePort;

    /**
     * Map of active servers by ID
     * @type {Map<string, ServerInstance>}
     * @private
     */
    this._servers = new Map();

    /**
     * Counter for generating unique server IDs
     * @type {number}
     * @private
     */
    this._idCounter = 0;

    /**
     * Reference to api-ape module (loaded lazily)
     * @type {Object|null}
     * @private
     */
    this._ape = null;
  }

  /**
   * Get a fresh api-ape server module (clears cache to allow multiple instances)
   * @returns {Object} The api-ape server module
   * @private
   */
  _getApe() {
    // Load api-ape server module and reset singleton state for testing
    const ape = require("../../server/index.js");

    // Reset the singleton flag to allow multiple server instances
    if (typeof ape.ape._serverApe._resetForTesting === "function") {
      ape.ape._serverApe._resetForTesting();
    }

    return ape;
  }

  /**
   * Find an available port
   * @returns {Promise<number>} An available port
   * @private
   */
  async _findAvailablePort() {
    const net = require("net");

    const checkPort = (port) => {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => {
          server.close(() => resolve(true));
        });
        server.listen(port, this.host);
      });
    };

    // Try ports starting from _nextPort
    let port = this._nextPort;
    const maxAttempts = 100;

    for (let i = 0; i < maxAttempts; i++) {
      if (await checkPort(port)) {
        this._nextPort = port + 1;
        return port;
      }
      port++;
    }

    throw new Error(
      `Could not find available port after ${maxAttempts} attempts`,
    );
  }

  /**
   * Create and start a new api-ape server
   *
   * @param {Object} options - Server configuration
   * @param {string} options.where - Directory containing API controllers (relative to simulator/)
   * @param {Function} [options.onConnect] - Connection lifecycle callback
   * @param {Object} [options.adapter] - Database adapter for Forest clustering
   * @param {Object} [options.fileTransferOptions] - File transfer configuration
   * @param {Object} [options.longPollingOptions] - Long polling configuration
   * @param {number} [options.longPollingOptions.heartbeatInterval=20000] - Heartbeat interval in ms
   * @param {number} [options.longPollingOptions.recycleTimeout=25000] - Connection recycle timeout in ms
   * @param {string} [options.id] - Custom server ID (auto-generated if not provided)
   * @returns {Promise<ServerInstance>} The created server instance
   *
   * @example
   * const server = await manager.create({
   *   where: 'test-api',
   *   onConnect: (socket, req, send) => {
   *     send('welcome', { message: 'Hello!' })
   *     return {
   *       embed: { userId: '123' },
   *       onDisconnect: () => console.log('Client left')
   *     }
   *   }
   * })
   */
  async create(options = {}) {
    const { ape } = this._getApe();

    // Generate server ID
    const id = options.id || `server-${++this._idCounter}`;

    // Find available port
    const port = await this._findAvailablePort();

    // Create HTTP server
    const httpServer = http.createServer((req, res) => {
      // Simple 404 for non-api-ape requests
      res.writeHead(404);
      res.end("Not Found");
    });

    // Handle 'where' path - api-ape's loader joins process.cwd() with the path,
    // so we need to compute a relative path from cwd to our test-api directory
    let where;
    if (options.where) {
      if (path.isAbsolute(options.where)) {
        // Already absolute - make it relative to cwd
        where = path.relative(process.cwd(), options.where);
      } else {
        // Relative path - resolve relative to simulator/ then make relative to cwd
        const absolutePath = path.resolve(__dirname, "..", options.where);
        where = path.relative(process.cwd(), absolutePath);
      }
    } else {
      // Default to test-api in simulator directory
      const absolutePath = path.resolve(__dirname, "..", "test-api");
      where = path.relative(process.cwd(), absolutePath);
    }

    // Prepare api-ape options
    const apeOptions = {
      where,
      onConnect: options.onConnect,
      fileTransferOptions: options.fileTransferOptions,
      longPollingOptions: options.longPollingOptions,
    };

    // Add adapter if provided
    if (options.adapter) {
      apeOptions.adapter = options.adapter;
    }

    // Initialize api-ape on the server
    let apeInstance;
    try {
      apeInstance = ape(httpServer, apeOptions);
    } catch (err) {
      // api-ape throws if already initialized, create fresh module context
      // For now, just re-throw - we'll handle this in Phase 2
      throw err;
    }

    // Start listening
    await new Promise((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, this.host, () => {
        httpServer.removeListener("error", reject);
        resolve();
      });
    });

    // Create server instance wrapper
    const instance = new ServerInstance({
      id,
      port,
      host: this.host,
      httpServer,
      apeInstance,
      ape: this._getApe(),
      apiPath: where, // Store the API path for clients to use
      manager: this,
    });

    // Track the server
    this._servers.set(id, instance);

    this.emit("server:created", instance);

    return instance;
  }

  /**
   * Get a server by ID
   * @param {string} id - The server ID
   * @returns {ServerInstance|undefined}
   */
  get(id) {
    return this._servers.get(id);
  }

  /**
   * Get all active servers
   * @returns {ServerInstance[]}
   */
  getAll() {
    return [...this._servers.values()];
  }

  /**
   * Close a specific server
   * @param {string} id - The server ID
   * @returns {Promise<void>}
   */
  async close(id) {
    const server = this._servers.get(id);
    if (server) {
      await server.close();
      this._servers.delete(id);
      this.emit("server:closed", id);
    }
  }

  /**
   * Close all servers (for test cleanup)
   * @returns {Promise<void>}
   */
  async closeAll() {
    const closePromises = [];
    for (const [id, server] of this._servers) {
      closePromises.push(
        server.close().then(() => {
          this._servers.delete(id);
          this.emit("server:closed", id);
        }),
      );
    }
    await Promise.all(closePromises);

    // Reset the FileTransferManager singleton to clear its cleanup interval
    const {
      resetFileTransferManager,
    } = require("../../server/lib/fileTransfer");
    resetFileTransferManager();
  }

  /**
   * Get the count of active servers
   * @returns {number}
   */
  get count() {
    return this._servers.size;
  }

  /**
   * Reset the manager (close all servers and reset state)
   * @returns {Promise<void>}
   */
  async reset() {
    await this.closeAll();
    this._nextPort = this.basePort;
    this._idCounter = 0;
  }
}

/**
 * Wrapper around a single api-ape server instance
 */
class ServerInstance extends EventEmitter {
  /**
   * Create a ServerInstance
   * @param {Object} config - Instance configuration
   * @private
   */
  constructor(config) {
    super();

    /**
     * Unique server identifier
     * @type {string}
     */
    this.id = config.id;

    /**
     * Port the server is listening on
     * @type {number}
     */
    this.port = config.port;

    /**
     * Host the server is bound to
     * @type {string}
     */
    this.host = config.host;

    /**
     * Full URL to the server
     * @type {string}
     */
    this.url = `http://${config.host}:${config.port}`;

    /**
     * WebSocket URL for the server
     * @type {string}
     */
    this.wsUrl = `ws://${config.host}:${config.port}`;

    /**
     * API path used by this server (e.g., 'simulator/test-api')
     * @type {string}
     */
    this.apiPath = config.apiPath;

    /**
     * The underlying HTTP server
     * @type {http.Server}
     * @private
     */
    this._httpServer = config.httpServer;

    /**
     * The api-ape instance returned from ape()
     * @type {Object}
     * @private
     */
    this._apeInstance = config.apeInstance;

    /**
     * Reference to api-ape module
     * @type {Object}
     * @private
     */
    this._ape = config.ape;

    /**
     * Reference to the server manager
     * @type {ServerManager}
     * @private
     */
    this._manager = config.manager;

    /**
     * Whether the server has been closed
     * @type {boolean}
     */
    this.closed = false;
  }

  /**
   * Broadcast a message to all connected clients
   * @param {string} type - Message type
   * @param {any} data - Message data
   * @param {string} [excludeClientId] - Client ID to exclude
   */
  broadcast(type, data, excludeClientId) {
    if (this._ape && this._ape.broadcast) {
      this._ape.broadcast(type, data, excludeClientId);
    }
  }

  /**
   * Get the map of connected clients
   * @returns {Map}
   */
  get clients() {
    return this._ape?.clients || new Map();
  }

  /**
   * Get the number of connected clients
   * @returns {number}
   */
  get clientCount() {
    return this.clients.size;
  }

  /**
   * Get the underlying HTTP server
   * @returns {http.Server}
   */
  get httpServer() {
    return this._httpServer;
  }

  /**
   * Get the api-ape core instance (contains fileTransfer, controllers, etc.)
   * @returns {Object}
   */
  get core() {
    return this._apeInstance?.core;
  }

  /**
   * Close the server
   * @returns {Promise<void>}
   */
  async close() {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Close all WebSocket connections
    if (this._apeInstance?.wss) {
      for (const client of this._apeInstance.wss.clients) {
        try {
          // Try terminate first (Node.js ws), then close as fallback
          if (typeof client.terminate === "function") {
            client.terminate();
          } else if (typeof client.close === "function") {
            client.close(1000, "Server closing");
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }

    // Wait for close events to propagate (prevents "Cannot log after tests are done")
    await new Promise((r) => setTimeout(r, 50));

    // Close the HTTP server
    await new Promise((resolve, reject) => {
      this._httpServer.close((err) => {
        if (err && err.code !== "ERR_SERVER_NOT_RUNNING") {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.emit("closed");
  }

  /**
   * Wait for a specific number of clients to connect
   * @param {number} count - Number of clients to wait for
   * @param {number} [timeout=5000] - Timeout in milliseconds
   * @returns {Promise<void>}
   */
  waitForClients(count, timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (this.clientCount >= count) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        reject(
          new Error(
            `Timeout waiting for ${count} clients (have ${this.clientCount})`,
          ),
        );
      }, timeout);

      const check = () => {
        if (this.clientCount >= count) {
          clearTimeout(timer);
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };

      check();
    });
  }

  /**
   * Get server info for debugging
   * @returns {Object}
   */
  getInfo() {
    return {
      id: this.id,
      url: this.url,
      wsUrl: this.wsUrl,
      clientCount: this.clientCount,
      closed: this.closed,
    };
  }
}

/**
 * Global server manager instance for simple tests
 * @type {ServerManager}
 */
const globalManager = new ServerManager();

/**
 * Create a server using the global manager
 * @param {Object} options - Server options
 * @returns {Promise<ServerInstance>}
 */
async function createServer(options) {
  return globalManager.create(options);
}

/**
 * Close all servers in the global manager
 * @returns {Promise<void>}
 */
async function closeAllServers() {
  return globalManager.closeAll();
}

/**
 * Reset the global server manager
 * @returns {Promise<void>}
 */
async function resetServerManager() {
  return globalManager.reset();
}

module.exports = {
  ServerManager,
  ServerInstance,
  globalManager,
  createServer,
  closeAllServers,
  resetServerManager,
};
