/**
 * @fileoverview Test Harness - Main Entry Point
 *
 * This module provides a unified interface for end-to-end testing of api-ape.
 * It ties together all the harness components:
 *
 * - FakeBrowser: Simulates browser environment for client code
 * - FakeDB: In-memory database adapter for Forest clustering
 * - ServerManager: Manages api-ape server instances
 * - ClientManager: Manages simulated browser clients
 *
 * @module simulator/harness
 *
 * @example
 * const { Harness } = require('./harness')
 *
 * // Create a new test harness
 * const harness = new Harness()
 *
 * // Start a server
 * const server = await harness.createServer({ where: 'test-api' })
 *
 * // Connect a client
 * const client = await harness.createClient({ url: server.url })
 *
 * // Run your tests...
 * const result = await client.call('echo', { message: 'Hello!' })
 *
 * // Cleanup
 * await harness.cleanup()
 */

const {
  ServerManager,
  ServerInstance,
  createServer,
  closeAllServers,
  resetServerManager,
} = require("./server-manager");
const {
  ClientManager,
  ClientInstance,
  createClient,
  closeAllClients,
  resetClientManager,
} = require("./client-manager");
const {
  FakeBrowser,
  FakeWindow,
  FakeDocument,
  FakeNavigator,
  createFakeBrowser,
} = require("./fake-browser");
const {
  FakeDatabase,
  createFakeDbAdapter,
  createGlobalFakeAdapter,
  resetGlobalFakeDb,
  globalFakeDb,
} = require("./fake-db");

/**
 * Main test harness that coordinates all testing components
 */
class Harness {
  /**
   * Create a new Harness instance
   * @param {Object} options - Configuration options
   * @param {number} [options.basePort=4000] - Starting port for servers
   * @param {number} [options.connectTimeout=5000] - Default client connection timeout
   * @param {boolean} [options.logging=false] - Enable debug logging
   */
  constructor(options = {}) {
    /**
     * Server manager instance
     * @type {ServerManager}
     */
    this.servers = new ServerManager({
      basePort: options.basePort || 4000,
    });

    /**
     * Client manager instance
     * @type {ClientManager}
     */
    this.clients = new ClientManager({
      connectTimeout: options.connectTimeout || 500,
    });

    /**
     * Fake database instance for this harness
     * @type {FakeDatabase}
     */
    this.db = new FakeDatabase();

    /**
     * Enable debug logging
     * @type {boolean}
     */
    this.logging = options.logging || false;

    /**
     * Track test start time for metrics
     * @type {number}
     * @private
     */
    this._startTime = Date.now();

    if (this.logging) {
      this._setupLogging();
    }
  }

  /**
   * Set up event logging for debugging
   * @private
   */
  _setupLogging() {
    this.servers.on("server:created", (server) => {
      console.log(`[Harness] Server created: ${server.id} at ${server.url}`);
    });

    this.servers.on("server:closed", (id) => {
      console.log(`[Harness] Server closed: ${id}`);
    });

    this.clients.on("client:created", (client) => {
      console.log(`[Harness] Client created: ${client.id} → ${client.url}`);
    });

    this.clients.on("client:closed", (id) => {
      console.log(`[Harness] Client closed: ${id}`);
    });

    this.db.logging = true;
    this.db.on("message", ({ from, to, message }) => {
      console.log(`[Harness] DB message: ${from} → ${to}`, message);
    });
  }

  /**
   * Create a new api-ape server
   *
   * @param {Object} options - Server configuration
   * @param {string} [options.where='test-api'] - Directory containing API controllers
   * @param {Function} [options.onConnect] - Connection lifecycle callback
   * @param {boolean} [options.useCluster=false] - Enable cluster mode with fake DB
   * @param {string} [options.serverId] - Custom server ID for cluster
   * @param {Object} [options.fileTransferOptions] - File transfer configuration
   * @returns {Promise<ServerInstance>} The created server instance
   *
   * @example
   * // Simple server
   * const server = await harness.createServer({ where: 'test-api' })
   *
   * // Server with cluster support
   * const server = await harness.createServer({
   *   where: 'test-api',
   *   useCluster: true,
   *   serverId: 'server-1'
   * })
   */
  async createServer(options = {}) {
    const serverOptions = {
      where: options.where || "test-api",
      onConnect: options.onConnect,
      fileTransferOptions: options.fileTransferOptions,
      id: options.id,
    };

    // Add cluster adapter if requested
    if (options.useCluster) {
      serverOptions.adapter = createFakeDbAdapter(this.db, {
        serverId: options.serverId,
      });
    }

    return this.servers.create(serverOptions);
  }

  /**
   * Create a new simulated client
   *
   * @param {Object} options - Client configuration
   * @param {string} options.url - Server URL to connect to
   * @param {string} [options.transport='auto'] - Transport mode
   * @param {Object} [options.cookies] - Cookies to set
   * @param {number} [options.connectTimeout] - Connection timeout
   * @returns {Promise<ClientInstance>} The created client instance
   *
   * @example
   * const client = await harness.createClient({ url: server.url })
   */
  async createClient(options) {
    return this.clients.create(options);
  }

  /**
   * Create a client connected to a specific server
   * Automatically uses the server's API path
   *
   * @param {ServerInstance} server - The server to connect to
   * @param {Object} [options] - Additional client options
   * @returns {Promise<ClientInstance>}
   */
  async createClientForServer(server, options = {}) {
    return this.clients.create({
      url: server.url,
      apiPath: server.apiPath,
      ...options,
    });
  }

  /**
   * Create multiple clients connected to the same server
   *
   * @param {string} url - Server URL
   * @param {number} count - Number of clients
   * @param {Object} [options] - Additional options
   * @returns {Promise<ClientInstance[]>}
   *
   * @example
   * const clients = await harness.createClients(server.url, 5)
   */
  async createClients(url, count, options = {}) {
    return this.clients.createMany(url, count, options);
  }

  /**
   * Convenience method: Create a server and connect a client
   *
   * @param {Object} [serverOptions] - Server options
   * @param {Object} [clientOptions] - Client options
   * @returns {Promise<{server: ServerInstance, client: ClientInstance}>}
   *
   * @example
   * const { server, client } = await harness.createPair()
   * const result = await client.call('echo', { test: true })
   */
  async createPair(serverOptions = {}, clientOptions = {}) {
    const server = await this.createServer(serverOptions);
    const client = await this.createClientForServer(server, clientOptions);
    return { server, client };
  }

  /**
   * Convenience method: Create a server with multiple clients
   *
   * @param {number} clientCount - Number of clients to create
   * @param {Object} [serverOptions] - Server options
   * @param {Object} [clientOptions] - Client options
   * @returns {Promise<{server: ServerInstance, clients: ClientInstance[]}>}
   *
   * @example
   * const { server, clients } = await harness.createGroup(3)
   * // clients[0], clients[1], clients[2] all connected to server
   */
  async createGroup(clientCount, serverOptions = {}, clientOptions = {}) {
    const server = await this.createServer(serverOptions);
    const clients = [];
    for (let i = 0; i < clientCount; i++) {
      const client = await this.createClientForServer(server, clientOptions);
      clients.push(client);
    }
    return { server, clients };
  }

  /**
   * Create a cluster of servers sharing the same fake database
   *
   * @param {number} serverCount - Number of servers
   * @param {Object} [options] - Server options
   * @returns {Promise<ServerInstance[]>}
   *
   * @example
   * const servers = await harness.createCluster(3)
   * // All servers share the same fake DB for cluster coordination
   */
  async createCluster(serverCount, options = {}) {
    const servers = [];
    for (let i = 0; i < serverCount; i++) {
      const server = await this.createServer({
        ...options,
        useCluster: true,
        serverId: `cluster-${i + 1}`,
        id: `cluster-server-${i + 1}`,
      });
      servers.push(server);
    }
    return servers;
  }

  /**
   * Wait for a condition to be true
   *
   * @param {Function} condition - Function that returns true when condition is met
   * @param {number} [timeout=500] - Timeout in milliseconds (short for local testing)
   * @param {number} [interval=10] - Check interval in milliseconds
   * @returns {Promise<void>}
   *
   * @example
   * await harness.waitFor(() => server.clientCount >= 3)
   */
  waitFor(condition, timeout = 500, interval = 10) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        try {
          if (condition()) {
            resolve();
            return;
          }
        } catch (err) {
          // Condition threw, keep waiting
        }

        if (Date.now() - startTime >= timeout) {
          reject(new Error(`Condition not met within ${timeout}ms`));
          return;
        }

        setTimeout(check, interval);
      };

      check();
    });
  }

  /**
   * Wait for a specified number of milliseconds
   *
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the current state of the harness for debugging
   *
   * @returns {Object} Harness state
   */
  getState() {
    return {
      servers: this.servers.getAll().map((s) => s.getInfo()),
      clients: this.clients.getAll().map((c) => c.getInfo()),
      db: this.db.getState(),
      uptime: Date.now() - this._startTime,
    };
  }

  /**
   * Clean up all resources
   * Call this after each test to ensure clean state
   *
   * @returns {Promise<void>}
   *
   * @example
   * afterEach(async () => {
   *   await harness.cleanup()
   * })
   */
  async cleanup() {
    // Close clients first (so servers don't have dangling connections)
    await this.clients.closeAll();

    // Close servers
    await this.servers.closeAll();

    // Reset database
    this.db.reset();

    // Reset counters
    await this.clients.reset();
    await this.servers.reset();
  }

  /**
   * Alias for cleanup()
   * @returns {Promise<void>}
   */
  async teardown() {
    return this.cleanup();
  }
}

/**
 * Global harness instance for simple tests
 * @type {Harness}
 */
const globalHarness = new Harness();

/**
 * Quick setup: Create server and client in one call
 *
 * @param {Object} [options] - Options
 * @param {string} [options.where] - API directory
 * @param {Function} [options.onConnect] - Server onConnect callback
 * @returns {Promise<{harness: Harness, server: ServerInstance, client: ClientInstance}>}
 *
 * @example
 * const { harness, server, client } = await quickSetup()
 * try {
 *   const result = await client.call('echo', { test: true })
 * } finally {
 *   await harness.cleanup()
 * }
 */
async function quickSetup(options = {}) {
  const harness = new Harness();
  const { server, client } = await harness.createPair(options);
  return { harness, server, client };
}

/**
 * Cleanup the global harness
 * @returns {Promise<void>}
 */
async function cleanup() {
  return globalHarness.cleanup();
}

// Export everything
module.exports = {
  // Main harness class
  Harness,

  // Global instance
  globalHarness,

  // Quick helpers
  quickSetup,
  cleanup,

  // Server components
  ServerManager,
  ServerInstance,
  createServer,
  closeAllServers,
  resetServerManager,

  // Client components
  ClientManager,
  ClientInstance,
  createClient,
  closeAllClients,
  resetClientManager,

  // Browser simulation
  FakeBrowser,
  FakeWindow,
  FakeDocument,
  FakeNavigator,
  createFakeBrowser,

  // Database simulation
  FakeDatabase,
  createFakeDbAdapter,
  createGlobalFakeAdapter,
  resetGlobalFakeDb,
  globalFakeDb,
};
