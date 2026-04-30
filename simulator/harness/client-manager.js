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

const { ClientInstance } = require("./client-instance");

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
