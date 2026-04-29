/**
 * @fileoverview APE Cluster Adapters - Multi-Database Support for Distributed Deployments
 *
 * This module provides automatic database detection and adapter creation for multi-server
 * coordination in api-ape deployments. When running multiple api-ape server instances
 * (e.g., behind a load balancer), adapters enable:
 *
 * - **Client Lookup**: Track which server owns each connected client
 * - **Inter-Server Messaging**: Route messages between servers via pub/sub
 * - **Broadcast Coordination**: Ensure broadcasts reach all clients across all servers
 *
 * Supported Databases:
 * - **Redis**: Uses PUB/SUB for real-time messaging (recommended for production)
 * - **MongoDB**: Uses Change Streams (requires replica set)
 * - **PostgreSQL**: Uses LISTEN/NOTIFY for real-time events
 * - **Supabase**: Uses Supabase Realtime channels
 * - **Firebase**: Uses Firebase Realtime Database listeners
 * - **Custom**: Bring your own adapter implementation
 *
 * @module server/adapters
 * @see {@link module:server/adapters/redis} - Redis adapter implementation
 * @see {@link module:server/adapters/mongo} - MongoDB adapter implementation
 * @see {@link module:server/adapters/postgres} - PostgreSQL adapter implementation
 * @see {@link module:server/adapters/supabase} - Supabase adapter implementation
 * @see {@link module:server/adapters/firebase} - Firebase adapter implementation
 *
 * @example
 * // Auto-detect and create adapter from Redis client
 * const redis = require('redis').createClient()
 * const adapter = await createAdapter(redis)
 *
 * @example
 * // Auto-detect and create adapter from MongoDB client
 * const { MongoClient } = require('mongodb')
 * const mongo = await MongoClient.connect('mongodb://localhost:27017')
 * const adapter = await createAdapter(mongo)
 *
 * @example
 * // Use with custom options
 * const adapter = await createAdapter(pgPool, {
 *     namespace: 'myapp',
 *     serverId: 'server-east-1'
 * })
 *
 * @example
 * // Use a custom adapter
 * const customAdapter = {
 *     join: async (id) => { ... },
 *     leave: async () => { ... },
 *     lookup: { add, read, remove },
 *     channels: { push, pull }
 * }
 * const adapter = await createAdapter(customAdapter)
 */

const { randomBytes } = require("crypto");
const { apeLog } = require("../../utils/apeLogger");

/**
 * Crockford Base32 alphabet for generating short, URL-safe IDs.
 * Excludes I, L, O, U to avoid confusion with 1, 1, 0, V.
 * @private
 * @constant {string}
 */
const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Encodes a byte array to a Crockford Base32 string.
 * Each byte is mapped to a character from the Base32 alphabet using the lower 5 bits.
 *
 * @private
 * @function B
 * @param {Buffer|Uint8Array} bytes - The bytes to encode
 * @returns {string} Base32 encoded string
 */
const B = (bytes) => [...bytes].map((v) => BASE32_ALPHABET[v & 31]).join("");

/**
 * Generates a short unique identifier for server identification.
 * Uses 8 random bytes encoded to Crockford Base32, producing an 8-character ID.
 *
 * The ID format is designed to be:
 * - URL-safe (no special characters)
 * - Case-insensitive (all uppercase)
 * - Human-readable (no confusing characters like I/1, O/0)
 * - Unique enough for server identification (32^8 ≈ 1 trillion combinations)
 *
 * @function uuid
 * @returns {string} 8-character unique identifier
 *
 * @example
 * const id = uuid()
 * console.log(id) // e.g., "A3BQ7KMN"
 */
const uuid = () => B(randomBytes(8));

/**
 * @typedef {'redis'|'mongo'|'postgres'|'supabase'|'firebase'|'custom'|null} ClientType
 * The detected database client type, or null if unrecognized.
 */

/**
 * @typedef {Object} LookupInterface
 * Interface for managing client-to-server mappings.
 *
 * @property {function(string): Promise<void>} add - Register a client as owned by this server
 * @property {function(string): Promise<string|null>} read - Look up which server owns a client
 * @property {function(string): Promise<void>} remove - Remove a client mapping (must be owner)
 */

/**
 * @typedef {Object} ChannelsInterface
 * Interface for inter-server message passing.
 *
 * @property {function(string, Object): Promise<void>} push - Send a message to a specific server or broadcast
 * @property {function(string, function): Promise<function>} pull - Subscribe to messages for a server ID
 */

/**
 * @typedef {Object} AdapterInstance
 * A fully-configured adapter instance for cluster coordination.
 *
 * @property {string} serverId - This server's unique identifier (read-only)
 * @property {function(string=): Promise<void>} join - Join the cluster and start listening
 * @property {function(): Promise<void>} leave - Leave the cluster and clean up resources
 * @property {LookupInterface} lookup - Client-to-server mapping operations
 * @property {ChannelsInterface} channels - Inter-server messaging operations
 */

/**
 * @typedef {Object} CustomAdapter
 * Interface for custom adapter implementations.
 *
 * @property {function(string=): Promise<void>} join - Join the cluster
 * @property {function(): Promise<void>} leave - Leave the cluster
 * @property {LookupInterface} lookup - Client lookup operations
 * @property {ChannelsInterface} channels - Channel operations
 */

/**
 * @typedef {Object} AdapterOptions
 * Configuration options for adapter creation.
 *
 * @property {string} [namespace='ape'] - Key/table prefix for database storage.
 *     Use different namespaces to run multiple api-ape clusters on the same database.
 * @property {string} [serverId] - This server's unique ID. Auto-generated if not provided.
 *     Useful for consistent server identification across restarts.
 */

/**
 * Detects the type of database client from its interface.
 * Uses duck-typing to identify the client based on its methods and properties.
 *
 * Detection priority:
 * 1. Custom adapter (has join, leave, lookup, channels)
 * 2. Redis (has duplicate and publish/PUBLISH methods)
 * 3. MongoDB (has db method and MongoClient constructor name)
 * 4. PostgreSQL (has query and connect methods)
 * 5. Supabase (has from and channel methods)
 * 6. Firebase (has ref method and goOnline or app property)
 *
 * @function detectClientType
 * @param {Object} client - Database client or custom adapter to detect
 * @returns {ClientType} The detected client type, or null if unrecognized
 *
 * @example
 * // Detect Redis client
 * const redis = require('redis').createClient()
 * console.log(detectClientType(redis)) // 'redis'
 *
 * @example
 * // Detect custom adapter
 * const custom = { join: () => {}, leave: () => {}, lookup: {}, channels: {} }
 * console.log(detectClientType(custom)) // 'custom'
 *
 * @example
 * // Unrecognized client
 * console.log(detectClientType({ foo: 'bar' })) // null
 */
function detectClientType(client) {
  if (!client) return null;

  // Custom adapter - has our interface methods
  if (
    typeof client.join === "function" &&
    typeof client.leave === "function" &&
    client.lookup &&
    client.channels
  ) {
    return "custom";
  }

  // Redis (node-redis or ioredis)
  if (
    typeof client.duplicate === "function" &&
    (typeof client.publish === "function" ||
      typeof client.PUBLISH === "function")
  ) {
    return "redis";
  }

  // MongoDB
  if (
    typeof client.db === "function" &&
    client.constructor?.name === "MongoClient"
  ) {
    return "mongo";
  }

  // PostgreSQL (pg.Pool)
  if (
    typeof client.query === "function" &&
    typeof client.connect === "function"
  ) {
    return "postgres";
  }

  // Supabase (has .from() for tables and .channel() for realtime)
  if (
    typeof client.from === "function" &&
    typeof client.channel === "function"
  ) {
    return "supabase";
  }

  // Firebase Realtime Database (has .ref() method)
  if (
    typeof client.ref === "function" &&
    (typeof client.goOnline === "function" || client.app)
  ) {
    return "firebase";
  }

  return null;
}

/**
 * Creates an adapter from a database client or custom adapter.
 * Automatically detects the client type and initializes the appropriate adapter.
 *
 * The adapter provides a unified interface for:
 * - Joining and leaving the cluster
 * - Tracking which clients are connected to which servers
 * - Sending messages between servers
 *
 * @async
 * @function createAdapter
 * @param {Object} client - Database client or custom adapter
 * @param {AdapterOptions} [opts={}] - Configuration options
 * @returns {Promise<AdapterInstance>} Configured adapter instance
 * @throws {Error} If the client type cannot be detected
 *
 * @example
 * // Basic usage with Redis
 * const redis = require('redis').createClient()
 * const adapter = await createAdapter(redis)
 * await adapter.join()
 *
 * // Register a client
 * await adapter.lookup.add('client-123')
 *
 * // Send message to another server
 * await adapter.channels.push('server-xyz', { type: 'message', data: {...} })
 *
 * // Clean up
 * await adapter.leave()
 *
 * @example
 * // With custom namespace and server ID
 * const adapter = await createAdapter(mongoClient, {
 *     namespace: 'production',
 *     serverId: 'api-server-1'
 * })
 */
async function createAdapter(client, opts = {}) {
  const type = detectClientType(client);
  const serverId = opts.serverId || uuid();
  const namespace = opts.namespace || "ape";

  if (!type) {
    throw new Error(
      "Unable to detect database type. Supported: Redis, MongoDB, PostgreSQL, Supabase, Firebase, or custom adapter.",
    );
  }

  apeLog.log(`APE: Detected ${type} adapter (serverId: ${serverId})`);

  switch (type) {
    case "custom":
      return wrapCustomAdapter(client, serverId);

    case "redis":
      const { createRedisAdapter } = require("./redis");
      return createRedisAdapter(client, { serverId, namespace });

    case "mongo":
      const { createMongoAdapter } = require("./mongo");
      return createMongoAdapter(client, { serverId, namespace });

    case "postgres":
      const { createPostgresAdapter } = require("./postgres");
      return createPostgresAdapter(client, { serverId, namespace });

    case "supabase":
      const { createSupabaseAdapter } = require("./supabase");
      return createSupabaseAdapter(client, { serverId, namespace });

    case "firebase":
      const { createFirebaseAdapter } = require("./firebase");
      return createFirebaseAdapter(client, { serverId, namespace });

    default:
      throw new Error(`Unknown adapter type: ${type}`);
  }
}

/**
 * Wraps a custom adapter to ensure consistent interface and provide serverId.
 * This normalizes custom adapters to match the expected AdapterInstance interface.
 *
 * @private
 * @function wrapCustomAdapter
 * @param {CustomAdapter} adapter - Custom adapter object with required methods
 * @param {string} serverId - Server ID to attach to the adapter
 * @returns {AdapterInstance} Wrapped adapter with consistent interface
 *
 * @example
 * const custom = {
 *     join: async (id) => console.log('Joined:', id),
 *     leave: async () => console.log('Left'),
 *     lookup: {
 *         add: async (clientId) => console.log('Added:', clientId),
 *         read: async (clientId) => 'server-1',
 *         remove: async (clientId) => console.log('Removed:', clientId)
 *     },
 *     channels: {
 *         push: async (target, msg) => console.log('Push:', target, msg),
 *         pull: async (target, handler) => () => {}
 *     }
 * }
 * const wrapped = wrapCustomAdapter(custom, 'my-server')
 */
function wrapCustomAdapter(adapter, serverId) {
  // Wrap to ensure consistent interface and default serverId
  return {
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
     * @param {string} [id] - Optional server ID override
     * @returns {Promise<void>}
     */
    join: (id) => adapter.join(id || serverId),

    /**
     * Leave the cluster and clean up resources.
     * @returns {Promise<void>}
     */
    leave: () => adapter.leave(),

    /**
     * Client-to-server mapping operations.
     * @type {LookupInterface}
     */
    lookup: {
      add: (clientId) => adapter.lookup.add(clientId),
      read: (clientId) => adapter.lookup.read(clientId),
      remove: (clientId) => adapter.lookup.remove(clientId),
    },

    /**
     * Inter-server messaging operations.
     * @type {ChannelsInterface}
     */
    channels: {
      push: (targetServerId, message) =>
        adapter.channels.push(targetServerId, message),
      pull: (targetServerId, handler) =>
        adapter.channels.pull(targetServerId, handler),
    },
  };
}

module.exports = {
  createAdapter,
  detectClientType,
  uuid,
};
