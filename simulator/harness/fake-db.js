/**
 * @fileoverview Fake In-Memory Database Adapter for Forest Cluster Testing
 *
 * This module provides an in-memory implementation of the api-ape adapter interface,
 * allowing cluster/Forest functionality to be tested without real databases.
 *
 * Features:
 * - Simulates Redis-like pub/sub for inter-server messaging
 * - In-memory client-to-server lookup table
 * - Support for multiple "servers" sharing the same fake DB instance
 * - Event-driven architecture for testing message flow
 *
 * @module simulator/harness/fake-db
 */

const { EventEmitter } = require('events');

/**
 * Shared in-memory storage that simulates a distributed database.
 * Multiple FakeDbAdapter instances can share this to simulate cluster behavior.
 */
class FakeDatabase extends EventEmitter {
  constructor() {
    super();

    /**
     * Client ID -> Server ID mapping (simulates Redis hash or DB table)
     * @type {Map<string, string>}
     */
    this.clientLookup = new Map();

    /**
     * Server ID -> Set of subscribed handlers (simulates pub/sub)
     * @type {Map<string, Set<Function>>}
     */
    this.subscriptions = new Map();

    /**
     * Track which servers are currently "connected"
     * @type {Set<string>}
     */
    this.activeServers = new Set();

    /**
     * Message history for debugging/testing
     * @type {Array<{from: string, to: string, message: Object, timestamp: number}>}
     */
    this.messageLog = [];

    /**
     * Enable/disable message logging
     * @type {boolean}
     */
    this.logging = false;
  }

  /**
   * Register a server as active in the cluster
   * @param {string} serverId - The server's unique identifier
   */
  joinServer(serverId) {
    this.activeServers.add(serverId);
    this.emit('server:join', serverId);
  }

  /**
   * Remove a server from the cluster
   * @param {string} serverId - The server's unique identifier
   */
  leaveServer(serverId) {
    this.activeServers.delete(serverId);

    // Clean up subscriptions
    this.subscriptions.delete(serverId);

    // Clean up client mappings owned by this server
    for (const [clientId, ownerId] of this.clientLookup) {
      if (ownerId === serverId) {
        this.clientLookup.delete(clientId);
      }
    }

    this.emit('server:leave', serverId);
  }

  /**
   * Add a client -> server mapping
   * @param {string} clientId - The client's unique identifier
   * @param {string} serverId - The server that owns this client
   */
  addClient(clientId, serverId) {
    this.clientLookup.set(clientId, serverId);
    this.emit('client:add', { clientId, serverId });
  }

  /**
   * Look up which server owns a client
   * @param {string} clientId - The client's unique identifier
   * @returns {string|null} The server ID or null if not found
   */
  readClient(clientId) {
    return this.clientLookup.get(clientId) || null;
  }

  /**
   * Remove a client mapping
   * @param {string} clientId - The client's unique identifier
   */
  removeClient(clientId) {
    const serverId = this.clientLookup.get(clientId);
    this.clientLookup.delete(clientId);
    this.emit('client:remove', { clientId, serverId });
  }

  /**
   * Subscribe to messages for a specific server
   * @param {string} serverId - The server to subscribe as
   * @param {Function} handler - Callback for received messages
   * @returns {Function} Unsubscribe function
   */
  subscribe(serverId, handler) {
    if (!this.subscriptions.has(serverId)) {
      this.subscriptions.set(serverId, new Set());
    }
    this.subscriptions.get(serverId).add(handler);

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(serverId);
      if (subs) {
        subs.delete(handler);
      }
    };
  }

  /**
   * Publish a message to a specific server or broadcast to all
   * @param {string} fromServerId - The sending server
   * @param {string} toServerId - Target server ID, or '*' for broadcast
   * @param {Object} message - The message payload
   */
  publish(fromServerId, toServerId, message) {
    if (this.logging) {
      this.messageLog.push({
        from: fromServerId,
        to: toServerId,
        message,
        timestamp: Date.now()
      });
    }

    if (toServerId === '*') {
      // Broadcast to all servers except sender
      for (const [serverId, handlers] of this.subscriptions) {
        if (serverId !== fromServerId) {
          handlers.forEach(handler => {
            // Simulate async delivery like real pub/sub
            setImmediate(() => handler(message));
          });
        }
      }
    } else {
      // Send to specific server
      const handlers = this.subscriptions.get(toServerId);
      if (handlers) {
        handlers.forEach(handler => {
          setImmediate(() => handler(message));
        });
      }
    }

    this.emit('message', { from: fromServerId, to: toServerId, message });
  }

  /**
   * Get current state for debugging
   * @returns {Object} Current database state
   */
  getState() {
    return {
      activeServers: [...this.activeServers],
      clientCount: this.clientLookup.size,
      clients: Object.fromEntries(this.clientLookup),
      subscriptionCount: this.subscriptions.size,
      messageLogLength: this.messageLog.length
    };
  }

  /**
   * Clear all state (for test cleanup)
   */
  reset() {
    this.clientLookup.clear();
    this.subscriptions.clear();
    this.activeServers.clear();
    this.messageLog = [];
    this.removeAllListeners();
  }
}

/**
 * Creates an adapter instance that wraps a FakeDatabase.
 * This implements the api-ape adapter interface.
 *
 * @param {FakeDatabase} db - Shared fake database instance
 * @param {Object} options - Configuration options
 * @param {string} options.serverId - This server's unique identifier
 * @param {string} [options.namespace='ape'] - Namespace prefix (for compatibility)
 * @returns {Object} Adapter instance compatible with api-ape
 */
function createFakeDbAdapter(db, options = {}) {
  const serverId = options.serverId || `fake-server-${Date.now()}`;
  const namespace = options.namespace || 'ape';

  let unsubscribe = null;
  let joined = false;

  return {
    /**
     * Get this server's unique identifier
     * @type {string}
     * @readonly
     */
    get serverId() {
      return serverId;
    },

    /**
     * Get the namespace
     * @type {string}
     * @readonly
     */
    get namespace() {
      return namespace;
    },

    /**
     * Check if this adapter has joined the cluster
     * @type {boolean}
     * @readonly
     */
    get isJoined() {
      return joined;
    },

    /**
     * Join the cluster and start listening for messages
     * @param {string} [id] - Optional server ID override
     * @returns {Promise<void>}
     */
    async join(id) {
      const actualId = id || serverId;
      db.joinServer(actualId);
      joined = true;
    },

    /**
     * Leave the cluster and clean up resources
     * @returns {Promise<void>}
     */
    async leave() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      db.leaveServer(serverId);
      joined = false;
    },

    /**
     * Client-to-server mapping operations
     */
    lookup: {
      /**
       * Register a client as owned by this server
       * @param {string} clientId - The client's unique identifier
       * @returns {Promise<void>}
       */
      async add(clientId) {
        db.addClient(clientId, serverId);
      },

      /**
       * Look up which server owns a client
       * @param {string} clientId - The client's unique identifier
       * @returns {Promise<string|null>} The server ID or null
       */
      async read(clientId) {
        return db.readClient(clientId);
      },

      /**
       * Remove a client mapping
       * @param {string} clientId - The client's unique identifier
       * @returns {Promise<void>}
       */
      async remove(clientId) {
        db.removeClient(clientId);
      }
    },

    /**
     * Inter-server messaging operations
     */
    channels: {
      /**
       * Send a message to a specific server or broadcast
       * @param {string} targetServerId - Target server ID, or '*' for broadcast
       * @param {Object} message - The message payload
       * @returns {Promise<void>}
       */
      async push(targetServerId, message) {
        db.publish(serverId, targetServerId, message);
      },

      /**
       * Subscribe to messages for this server
       * @param {string} targetServerId - The server ID to listen as (usually own ID)
       * @param {Function} handler - Callback for received messages
       * @returns {Promise<Function>} Unsubscribe function
       */
      async pull(targetServerId, handler) {
        unsubscribe = db.subscribe(targetServerId, handler);
        return unsubscribe;
      }
    }
  };
}

/**
 * Global fake database instance for simple single-cluster tests
 * @type {FakeDatabase}
 */
const globalFakeDb = new FakeDatabase();

/**
 * Create a fake adapter using the global database instance
 * Convenient for simple tests where all servers share one "database"
 *
 * @param {Object} [options] - Configuration options
 * @param {string} [options.serverId] - This server's unique identifier
 * @returns {Object} Adapter instance
 */
function createGlobalFakeAdapter(options = {}) {
  return createFakeDbAdapter(globalFakeDb, options);
}

/**
 * Reset the global fake database (for test cleanup)
 */
function resetGlobalFakeDb() {
  globalFakeDb.reset();
}

module.exports = {
  FakeDatabase,
  createFakeDbAdapter,
  createGlobalFakeAdapter,
  resetGlobalFakeDb,
  globalFakeDb
};
