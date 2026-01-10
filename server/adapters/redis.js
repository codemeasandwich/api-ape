/**
 * @fileoverview Redis Adapter for APE Cluster
 *
 * This adapter enables multi-server api-ape deployments using Redis as the
 * coordination backend. Redis PUB/SUB provides extremely fast real-time
 * inter-server messaging with minimal latency.
 *
 * This is the **recommended adapter** for production deployments due to:
 * - Low latency (<1ms for local Redis)
 * - High throughput (100k+ messages/second)
 * - Simple setup (no replica sets or special configuration)
 * - Wide availability (Redis is ubiquitous)
 *
 * Features:
 * - **Real-time messaging**: Uses Redis PUB/SUB for instant delivery
 * - **Simple key-value storage**: Client mappings stored as plain keys
 * - **Dual client support**: Works with both node-redis v4+ and ioredis
 * - **State machine**: Prevents invalid state transitions (INIT → JOINED → LEFT)
 *
 * Key Structure:
 * ```
 * {namespace}:client:{clientId} -> serverId  (string)
 * {namespace}:channel:{serverId} -> (pub/sub channel)
 * {namespace}:channel:ALL -> (broadcast pub/sub channel)
 * ```
 *
 * @module server/adapters/redis
 * @see {@link module:server/adapters} - Main adapter factory
 * @see {@link https://redis.io/topics/pubsub} - Redis PUB/SUB documentation
 *
 * @example
 * // Basic setup with node-redis
 * const redis = require('redis')
 * const client = redis.createClient({ url: 'redis://localhost:6379' })
 * await client.connect()
 *
 * const { createRedisAdapter } = require('api-ape/server/adapters/redis')
 * const adapter = await createRedisAdapter(client, { serverId: 'api-server-1' })
 * await adapter.join()
 *
 * @example
 * // Using with ioredis
 * const Redis = require('ioredis')
 * const client = new Redis('redis://localhost:6379')
 *
 * const adapter = await createRedisAdapter(client, {
 *     serverId: 'production-server-1',
 *     namespace: 'myapp'
 * })
 */

/**
 * @typedef {Object} RedisClient
 * Redis client instance. Supports both node-redis and ioredis.
 *
 * @property {function(): RedisClient} duplicate - Create a duplicate connection
 * @property {function(string, string): Promise<number>} publish - Publish to a channel
 * @property {function(string): Promise<void>} subscribe - Subscribe to a channel
 * @property {function(string, string): Promise<string|null>} set - Set a key
 * @property {function(string): Promise<string|null>} get - Get a key
 * @property {function(string): Promise<number>} del - Delete a key
 * @property {function(): Promise<void>} quit - Close the connection
 * @property {function=} connect - Connect (node-redis v4+)
 * @property {boolean=} isOpen - Connection state (node-redis v4+)
 */

/**
 * @typedef {Object} RedisAdapterOptions
 * Configuration options for the Redis adapter.
 *
 * @property {string} serverId - This server's unique identifier (required)
 * @property {string} [namespace='ape'] - Key prefix for all Redis keys.
 *     Use different namespaces to run multiple api-ape clusters on the same Redis.
 */

/**
 * @typedef {Object} RedisAdapterInstance
 * A configured Redis adapter instance for cluster coordination.
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
 * Creates a Redis adapter for APE cluster coordination.
 *
 * This function creates dedicated pub/sub connections and provides a unified
 * interface for:
 * - Tracking which clients are connected to which servers
 * - Sending messages between servers in the cluster
 * - Broadcasting messages to all servers
 *
 * The adapter uses a state machine to ensure proper lifecycle management:
 * 1. INIT → JOINED: Call `join()` to start listening for messages
 * 2. JOINED → LEFT: Call `leave()` to clean up and disconnect
 * 3. Cannot transition from LEFT back to JOINED (create new adapter)
 *
 * **Important**: This adapter creates TWO additional Redis connections
 * (one for publish, one for subscribe) by calling `duplicate()` on the
 * provided client. This is required because Redis clients in subscribe
 * mode cannot execute other commands.
 *
 * @async
 * @function createRedisAdapter
 * @param {RedisClient} redis - Redis client instance (node-redis or ioredis)
 * @param {RedisAdapterOptions} options - Configuration options
 * @param {string} options.serverId - This server's unique identifier
 * @param {string} [options.namespace='ape'] - Key prefix for Redis
 * @returns {Promise<RedisAdapterInstance>} Configured adapter instance
 * @throws {Error} If serverId is not provided
 *
 * @example
 * // Basic setup with node-redis v4
 * const redis = require('redis')
 * const client = redis.createClient()
 * await client.connect()
 *
 * const { createRedisAdapter } = require('api-ape/server/adapters/redis')
 * const adapter = await createRedisAdapter(client, {
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
 *     await client.quit()
 * })
 */
async function createRedisAdapter(redis, { serverId, namespace = "ape" }) {
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
   * Dedicated Redis client for PUBLISH commands.
   * Created by duplicating the original connection.
   * @type {RedisClient}
   * @private
   */
  const pub = redis.duplicate();

  /**
   * Dedicated Redis client for SUBSCRIBE commands.
   * Created by duplicating the original connection.
   * In subscribe mode, this client cannot run other commands.
   * @type {RedisClient}
   * @private
   */
  const sub = redis.duplicate();

  /**
   * Key helper functions.
   * Generates consistent Redis keys with the namespace prefix.
   * @private
   */
  const key = {
    /**
     * Get the key for a client's server mapping.
     * @param {string} id - Client ID
     * @returns {string} Redis key
     */
    client: (id) => `${namespace}:client:${id}`,

    /**
     * Get the channel name for a server.
     * Empty or null ID returns the broadcast channel "ALL".
     * @param {string|null} id - Server ID or empty for broadcast
     * @returns {string} Redis channel name
     */
    channel: (id) => `${namespace}:channel:${id || "ALL"}`,
  };

  // Connect pub/sub clients if needed (node-redis v4+ style)
  if (typeof pub.connect === "function" && pub.isOpen === false) {
    await pub.connect();
  }
  if (typeof sub.connect === "function" && sub.isOpen === false) {
    await sub.connect();
  }

  /**
   * Handle incoming messages from subscribed channels.
   * Parses JSON and dispatches to registered handlers.
   *
   * This is set up for node-redis v4 style (event-based).
   * For ioredis, the 'message' event works similarly.
   * @private
   */
  if (typeof sub.on === "function") {
    sub.on("message", (channel, message) => {
      try {
        const data = JSON.parse(message);
        // Find matching handler by checking channel patterns
        for (const [pattern, handler] of handlers) {
          if (channel === key.channel(pattern) || channel === key.channel("")) {
            handler(data, data._senderServerId || serverId);
          }
        }
      } catch (e) {
        console.error("📛 Redis adapter: failed to parse message", e.message);
      }
    });
  }

  /**
   * The adapter instance with all public methods.
   * @type {RedisAdapterInstance}
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
     * Subscribes to:
     * - This server's direct message channel
     * - The broadcast channel (ALL)
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

      // Subscribe to this server's direct channel + broadcast channel
      await sub.subscribe(key.channel(sid));
      await sub.subscribe(key.channel(""));

      state = "JOINED";
      console.log(`✅ Redis adapter: joined as ${sid}`);
    },

    /**
     * Leave the cluster and clean up all resources.
     *
     * This method:
     * 1. Removes all client mappings owned by this server
     * 2. Unsubscribes from all channels
     * 3. Closes the pub/sub connections
     * 4. Transitions to LEFT state (cannot rejoin)
     *
     * @async
     * @returns {Promise<void>}
     *
     * @example
     * // Clean shutdown
     * process.on('SIGTERM', async () => {
     *     await adapter.leave()
     *     await redis.quit()
     *     process.exit(0)
     * })
     */
    async leave() {
      if (state !== "JOINED") return;
      state = "LEFT";

      console.log(
        `🔴 Redis adapter: leaving, cleaning up ${ownedClients.size} clients`,
      );

      // Remove all owned client mappings
      for (const clientId of ownedClients) {
        try {
          await pub.del(key.client(clientId));
        } catch (e) {
          console.error(
            `📛 Redis adapter: failed to remove client ${clientId}`,
            e.message,
          );
        }
      }
      ownedClients.clear();

      // Unsubscribe and disconnect
      try {
        await sub.unsubscribe();
        await pub.quit();
        await sub.quit();
      } catch (e) {
        // Ignore disconnect errors (connection may already be closed)
      }
    },

    /**
     * Client-to-server mapping operations.
     * Used to track which clients are connected to which servers.
     */
    lookup: {
      /**
       * Register a client as owned by this server.
       * Stores a simple key-value mapping in Redis.
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
        await pub.set(key.client(clientId), serverId);
        ownedClients.add(clientId);
        console.log(
          `📍 Redis adapter: registered client ${clientId} -> ${serverId}`,
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
        const result = await pub.get(key.client(clientId));
        return result || null;
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
        await pub.del(key.client(clientId));
        ownedClients.delete(clientId);
        console.log(`🗑️ Redis adapter: removed client ${clientId}`);
      },
    },

    /**
     * Inter-server messaging operations.
     * Used to send messages between servers in the cluster.
     */
    channels: {
      /**
       * Send a message to a specific server or broadcast to all.
       * Uses Redis PUBLISH to send the message to the appropriate channel.
       *
       * The message is JSON-serialized with `_senderServerId` added
       * to identify the source server.
       *
       * @async
       * @param {string} targetServerId - Target server ID, or empty string for broadcast
       * @param {Object} message - Message payload (will be JSON-serialized)
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
        const channel = key.channel(targetServerId);
        const payload = JSON.stringify({
          ...message,
          _senderServerId: serverId,
        });
        await pub.publish(channel, payload);

        if (targetServerId) {
          console.log(`📤 Redis adapter: pushed to server ${targetServerId}`);
        } else {
          console.log(`📢 Redis adapter: broadcast to all servers`);
        }
      },

      /**
       * Subscribe to messages for a specific channel.
       *
       * Note: The actual Redis SUBSCRIBE is set up during `join()`.
       * This method just registers a handler for filtering incoming messages.
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

module.exports = { createRedisAdapter };
