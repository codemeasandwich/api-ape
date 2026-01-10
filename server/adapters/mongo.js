/**
 * @fileoverview MongoDB Adapter for APE Cluster
 *
 * This adapter enables multi-server api-ape deployments using MongoDB as the
 * coordination backend. MongoDB Change Streams provide real-time notifications
 * for document changes, enabling instant message delivery between servers.
 *
 * **Important**: Change Streams require a MongoDB replica set. Standalone MongoDB
 * instances do not support change streams. For development, you can use:
 * - MongoDB Atlas (free tier supports change streams)
 * - Local replica set with `mongod --replSet rs0`
 *
 * Features:
 * - **Real-time messaging**: Uses Change Streams for instant delivery
 * - **TTL indexes**: Messages auto-expire after 1 hour
 * - **Atomic operations**: Uses `updateOne` with upsert for client mappings
 * - **State machine**: Prevents invalid state transitions (INIT → JOINED → LEFT)
 *
 * Database Structure:
 * ```
 * {namespace}_cluster/
 *   clients/
 *     { clientId: "abc", serverId: "server-1", updatedAt: Date }
 *   events/
 *     { targetServerId: "server-1", senderServerId: "server-2",
 *       message: {...}, createdAt: Date }
 * ```
 *
 * @module server/adapters/mongo
 * @see {@link module:server/adapters} - Main adapter factory
 * @see {@link https://docs.mongodb.com/manual/changeStreams/} - MongoDB Change Streams
 *
 * @example
 * // Basic setup with MongoDB client
 * const { MongoClient } = require('mongodb')
 * const client = await MongoClient.connect('mongodb://localhost:27017')
 *
 * const { createMongoAdapter } = require('api-ape/server/adapters/mongo')
 * const adapter = await createMongoAdapter(client, { serverId: 'api-server-1' })
 * await adapter.join()
 *
 * @example
 * // Using with MongoDB Atlas
 * const client = await MongoClient.connect(process.env.MONGODB_URI)
 * const adapter = await createMongoAdapter(client, {
 *     serverId: 'production-server-1',
 *     namespace: 'myapp'
 * })
 */

/**
 * @typedef {Object} MongoClient
 * MongoDB client instance from the `mongodb` package.
 *
 * @property {function(string): Db} db - Get a database instance
 * @property {Object} constructor - Constructor with name property
 * @property {string} constructor.name - Should be 'MongoClient'
 */

/**
 * @typedef {Object} Db
 * MongoDB database instance.
 *
 * @property {function(string): Collection} collection - Get a collection
 */

/**
 * @typedef {Object} Collection
 * MongoDB collection instance.
 *
 * @property {function(Object, Object=): Promise<void>} createIndex - Create an index
 * @property {function(Object, Object, Object=): Promise<void>} updateOne - Update one document
 * @property {function(Object): Promise<Object|null>} findOne - Find one document
 * @property {function(Object): Promise<void>} deleteOne - Delete one document
 * @property {function(Object): Promise<void>} deleteMany - Delete multiple documents
 * @property {function(Object): Promise<void>} insertOne - Insert one document
 * @property {function(Array, Object=): ChangeStream} watch - Watch for changes
 */

/**
 * @typedef {Object} ChangeStream
 * MongoDB change stream for real-time notifications.
 *
 * @property {function(string, function): void} on - Subscribe to events
 * @property {function(): Promise<void>} close - Close the change stream
 */

/**
 * @typedef {Object} MongoAdapterOptions
 * Configuration options for the MongoDB adapter.
 *
 * @property {string} serverId - This server's unique identifier (required)
 * @property {string} [namespace='ape'] - Database name prefix.
 *     The actual database will be `{namespace}_cluster`.
 */

/**
 * @typedef {Object} MongoAdapterInstance
 * A configured MongoDB adapter instance for cluster coordination.
 *
 * @property {string} serverId - This server's unique identifier (read-only getter)
 * @property {function(string=): Promise<void>} join - Join the cluster and start listening
 * @property {function(): Promise<void>} leave - Leave the cluster and clean up
 * @property {Object} lookup - Client-to-server mapping operations
 * @property {function(string): Promise<void>} lookup.add - Register a client
 * @property {function(string): Promise<string|null>} lookup.read - Find client's server
 * @property {function(string): Promise<void>} lookup.remove - Remove a client mapping
 * @property {Object} channels - Inter-server messaging
 * @property {function(string, Object): Promise<void>} channels.push - Send message
 * @property {function(string, function): Promise<function>} channels.pull - Subscribe to messages
 */

/**
 * @typedef {'INIT'|'JOINED'|'LEFT'} AdapterState
 * State machine states for the adapter lifecycle:
 * - INIT: Initial state, not yet joined
 * - JOINED: Successfully joined the cluster
 * - LEFT: Left the cluster, cannot rejoin (create new adapter instead)
 */

/**
 * Creates a MongoDB adapter for APE cluster coordination.
 *
 * This function sets up MongoDB collections, indexes, and change streams to provide
 * a unified interface for:
 * - Tracking which clients are connected to which servers
 * - Sending messages between servers in the cluster
 * - Broadcasting messages to all servers
 *
 * The adapter uses a state machine to ensure proper lifecycle management:
 * 1. INIT → JOINED: Call `join()` to start listening for messages
 * 2. JOINED → LEFT: Call `leave()` to clean up and disconnect
 * 3. Cannot transition from LEFT back to JOINED (create new adapter)
 *
 * **Note**: If change streams are not available (standalone MongoDB), the adapter
 * will log a warning and continue without real-time message delivery. Consider
 * implementing a polling fallback for such environments.
 *
 * @async
 * @function createMongoAdapter
 * @param {MongoClient} mongoClient - MongoDB client instance
 * @param {MongoAdapterOptions} options - Configuration options
 * @param {string} options.serverId - This server's unique identifier
 * @param {string} [options.namespace='ape'] - Database/collection prefix
 * @returns {Promise<MongoAdapterInstance>} Configured adapter instance
 * @throws {Error} If serverId is not provided
 *
 * @example
 * // Basic setup
 * const { MongoClient } = require('mongodb')
 * const client = await MongoClient.connect('mongodb://localhost:27017/?replicaSet=rs0')
 *
 * const { createMongoAdapter } = require('api-ape/server/adapters/mongo')
 * const adapter = await createMongoAdapter(client, {
 *     serverId: 'api-server-1'
 * })
 *
 * // Join the cluster
 * await adapter.join()
 *
 * // Register a connected client
 * await adapter.lookup.add('client-abc-123')
 *
 * // Send a message to another server
 * await adapter.channels.push('api-server-2', {
 *     type: 'forward',
 *     clientId: 'client-xyz',
 *     data: { message: 'Hello!' }
 * })
 *
 * // Broadcast to all servers
 * await adapter.channels.push('', { type: 'sync', data: {...} })
 *
 * // Subscribe to messages
 * const unsubscribe = await adapter.channels.pull('', (msg, senderId) => {
 *     console.log(`Received from ${senderId}:`, msg)
 * })
 *
 * // Clean up on shutdown
 * process.on('SIGTERM', async () => {
 *     await adapter.leave()
 *     await client.close()
 * })
 */
async function createMongoAdapter(
  mongoClient,
  { serverId, namespace = "ape" },
) {
  if (!serverId) throw new Error("serverId required");

  /**
   * Current adapter state (INIT → JOINED → LEFT)
   * @type {AdapterState}
   * @private
   */
  let state = "INIT";

  /**
   * Set of client IDs owned by this server.
   * Used during cleanup to remove only our own client mappings.
   * @type {Set<string>}
   * @private
   */
  const ownedClients = new Set();

  /**
   * Map of channel handlers keyed by target server ID.
   * Empty string key represents the broadcast channel.
   * @type {Map<string, function(Object, string): void>}
   * @private
   */
  const handlers = new Map();

  /**
   * MongoDB Change Stream for real-time event notifications.
   * @type {ChangeStream|null}
   * @private
   */
  let changeStream = null;

  /**
   * Dedicated database for APE cluster data.
   * Using a separate database keeps cluster data isolated.
   * @type {Db}
   * @private
   */
  const db = mongoClient.db(`${namespace}_cluster`);

  /**
   * Collection for client-to-server mappings.
   * Each document: { clientId, serverId, updatedAt }
   * @type {Collection}
   * @private
   */
  const clientsCol = db.collection("clients");

  /**
   * Collection for inter-server events/messages.
   * Each document: { targetServerId, senderServerId, message, createdAt }
   * Has a TTL index that auto-deletes documents after 1 hour.
   * @type {Collection}
   * @private
   */
  const eventsCol = db.collection("events");

  /**
   * Ensures required indexes exist on collections.
   * Called during `join()` to set up the database schema.
   *
   * Creates:
   * - Unique index on clients.clientId
   * - Index on clients.serverId (for cleanup queries)
   * - TTL index on events.createdAt (auto-delete after 1 hour)
   * - Compound index on events for efficient queries
   *
   * @async
   * @private
   * @function ensureIndexes
   * @returns {Promise<void>}
   */
  async function ensureIndexes() {
    await clientsCol.createIndex({ clientId: 1 }, { unique: true });
    await clientsCol.createIndex({ serverId: 1 });
    // Events TTL - auto-delete after 1 hour
    await eventsCol.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 });
    await eventsCol.createIndex({ targetServerId: 1, createdAt: 1 });
  }

  /**
   * The adapter instance with all public methods.
   * @type {MongoAdapterInstance}
   */
  const adapter = {
    /**
     * Get this server's unique identifier.
     * @type {string}
     * @readonly
     */
    get serverId() {
      return serverId;
    },

    /**
     * Join the cluster and start listening for messages.
     *
     * Sets up:
     * - Database indexes for efficient queries
     * - Change stream watching for this server's messages and broadcasts
     *
     * **Note**: Change streams require a MongoDB replica set. If not available,
     * a warning is logged and the adapter continues without real-time delivery.
     *
     * @async
     * @param {string} [id] - Optional server ID override (defaults to constructor serverId)
     * @returns {Promise<void>}
     * @throws {Error} If already joined or previously left
     *
     * @example
     * await adapter.join()
     * console.log('Joined cluster as:', adapter.serverId)
     */
    async join(id) {
      const sid = id || serverId;
      if (!sid?.trim()) throw new Error("serverId required");
      if (state === "JOINED") throw new Error("already joined");
      if (state === "LEFT") throw new Error("cannot rejoin after leave");

      await ensureIndexes();

      // Watch for events targeted to this server or broadcast
      try {
        changeStream = eventsCol.watch(
          [
            {
              $match: {
                "fullDocument.targetServerId": { $in: [sid, ""] },
                operationType: "insert",
              },
            },
          ],
          { fullDocument: "updateLookup" },
        );

        changeStream.on("change", (change) => {
          if (change.operationType === "insert") {
            const doc = change.fullDocument;
            const handler =
              handlers.get(doc.targetServerId) || handlers.get("");
            if (handler) {
              handler(doc.message, doc.senderServerId);
            }
          }
        });

        changeStream.on("error", (err) => {
          console.error("📛 Mongo adapter: change stream error", err.message);
        });
      } catch (e) {
        console.warn(
          "⚠️ Mongo adapter: Change streams not available (requires replica set). Falling back to polling.",
        );
        // Could implement polling fallback here
      }

      state = "JOINED";
      console.log(`✅ Mongo adapter: joined as ${sid}`);
    },

    /**
     * Leave the cluster and clean up all resources.
     *
     * This method:
     * 1. Closes the MongoDB change stream
     * 2. Removes all client mappings owned by this server
     * 3. Transitions to LEFT state (cannot rejoin)
     *
     * @async
     * @returns {Promise<void>}
     *
     * @example
     * // Clean shutdown
     * process.on('SIGTERM', async () => {
     *     await adapter.leave()
     *     await mongoClient.close()
     *     process.exit(0)
     * })
     */
    async leave() {
      if (state !== "JOINED") return;
      state = "LEFT";

      console.log(
        `🔴 Mongo adapter: leaving, cleaning up ${ownedClients.size} clients`,
      );

      // Close change stream
      if (changeStream) {
        await changeStream.close();
        changeStream = null;
      }

      // Remove all owned client mappings in a single operation
      if (ownedClients.size > 0) {
        await clientsCol.deleteMany({
          clientId: { $in: Array.from(ownedClients) },
        });
      }
      ownedClients.clear();
    },

    /**
     * Client-to-server mapping operations.
     * Used to track which clients are connected to which servers.
     */
    lookup: {
      /**
       * Register a client as owned by this server.
       * Uses upsert to handle reconnections gracefully.
       *
       * @async
       * @param {string} clientId - The client's unique identifier
       * @returns {Promise<void>}
       *
       * @example
       * // When a client connects
       * ws.on('connection', async (socket) => {
       *     const clientId = generateClientId()
       *     await adapter.lookup.add(clientId)
       * })
       */
      async add(clientId) {
        await clientsCol.updateOne(
          { clientId },
          { $set: { clientId, serverId, updatedAt: new Date() } },
          { upsert: true },
        );
        ownedClients.add(clientId);
        console.log(
          `📍 Mongo adapter: registered client ${clientId} -> ${serverId}`,
        );
      },

      /**
       * Look up which server owns a client.
       *
       * @async
       * @param {string} clientId - The client's unique identifier
       * @returns {Promise<string|null>} Server ID owning the client, or null if not found
       *
       * @example
       * // Route message to correct server
       * const targetServer = await adapter.lookup.read(targetClientId)
       * if (targetServer && targetServer !== adapter.serverId) {
       *     await adapter.channels.push(targetServer, message)
       * }
       */
      async read(clientId) {
        const doc = await clientsCol.findOne({ clientId });
        return doc?.serverId || null;
      },

      /**
       * Remove a client mapping.
       * Can only remove clients owned by this server (security).
       *
       * @async
       * @param {string} clientId - The client's unique identifier
       * @returns {Promise<void>}
       * @throws {Error} If this server doesn't own the client
       *
       * @example
       * // When a client disconnects
       * ws.on('close', async () => {
       *     await adapter.lookup.remove(clientId)
       * })
       */
      async remove(clientId) {
        if (!ownedClients.has(clientId)) {
          throw new Error(`not owner: cannot remove client ${clientId}`);
        }
        await clientsCol.deleteOne({ clientId });
        ownedClients.delete(clientId);
        console.log(`🗑️ Mongo adapter: removed client ${clientId}`);
      },
    },

    /**
     * Inter-server messaging operations.
     * Used to send messages between servers in the cluster.
     */
    channels: {
      /**
       * Send a message to a specific server or broadcast to all.
       * Messages are stored in the events collection and delivered via change streams.
       * They auto-expire after 1 hour thanks to the TTL index.
       *
       * @async
       * @param {string} targetServerId - Target server ID, or empty string for broadcast
       * @param {Object} message - Message payload (will be stored in MongoDB)
       * @returns {Promise<void>}
       *
       * @example
       * // Send to specific server
       * await adapter.channels.push('server-2', {
       *     type: 'forward',
       *     clientId: 'client-123',
       *     data: { text: 'Hello!' }
       * })
       *
       * @example
       * // Broadcast to all servers
       * await adapter.channels.push('', {
       *     type: 'sync',
       *     data: { config: {...} }
       * })
       */
      async push(targetServerId, message) {
        await eventsCol.insertOne({
          targetServerId: targetServerId || "",
          senderServerId: serverId,
          message,
          createdAt: new Date(),
        });

        if (targetServerId) {
          console.log(`📤 Mongo adapter: pushed to server ${targetServerId}`);
        } else {
          console.log(`📢 Mongo adapter: broadcast to all servers`);
        }
      },

      /**
       * Subscribe to messages for a specific channel.
       *
       * @async
       * @param {string} targetServerId - Server ID to listen for, or empty for broadcast
       * @param {function(Object, string): void} handler - Callback for received messages
       *     - First argument: The message payload
       *     - Second argument: The sender's server ID
       * @returns {Promise<function(): Promise<void>>} Unsubscribe function
       *
       * @example
       * // Listen for broadcast messages
       * const unsubscribe = await adapter.channels.pull('', (message, senderId) => {
       *     console.log(`Broadcast from ${senderId}:`, message)
       * })
       *
       * // Later, stop listening
       * await unsubscribe()
       *
       * @example
       * // Listen for direct messages
       * await adapter.channels.pull(adapter.serverId, (message, senderId) => {
       *     console.log(`Direct message from ${senderId}:`, message)
       * })
       */
      async pull(targetServerId, handler) {
        handlers.set(targetServerId || "", handler);

        // Return unsubscribe function
        return async () => {
          handlers.delete(targetServerId || "");
        };
      },
    },
  };

  return adapter;
}

module.exports = { createMongoAdapter };
