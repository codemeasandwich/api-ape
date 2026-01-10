/**
 * @fileoverview PostgreSQL Adapter for APE Cluster
 *
 * This adapter enables multi-server api-ape deployments using PostgreSQL as the
 * coordination backend. PostgreSQL's LISTEN/NOTIFY provides a native pub/sub
 * mechanism for real-time inter-server messaging.
 *
 * Features:
 * - **Real-time messaging**: Uses PostgreSQL LISTEN/NOTIFY for instant delivery
 * - **No external dependencies**: Works with any PostgreSQL 9.0+ instance
 * - **Connection pooling**: Uses the pg.Pool for efficient connection management
 * - **State machine**: Prevents invalid state transitions (INIT → JOINED → LEFT)
 *
 * Database Schema (auto-created):
 * ```sql
 * CREATE TABLE {namespace}_clients (
 *   client_id VARCHAR(255) PRIMARY KEY,
 *   server_id VARCHAR(255) NOT NULL,
 *   updated_at TIMESTAMP DEFAULT NOW()
 * );
 * CREATE INDEX idx_{namespace}_clients_server_id ON {namespace}_clients(server_id);
 * ```
 *
 * **Note**: NOTIFY payloads are limited to ~8000 bytes. For larger messages,
 * consider using a table-based queue or external message broker.
 *
 * @module server/adapters/postgres
 * @see {@link module:server/adapters} - Main adapter factory
 * @see {@link https://www.postgresql.org/docs/current/sql-notify.html} - PostgreSQL NOTIFY
 *
 * @example
 * // Basic setup with pg Pool
 * const { Pool } = require('pg')
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL })
 *
 * const { createPostgresAdapter } = require('api-ape/server/adapters/postgres')
 * const adapter = await createPostgresAdapter(pool, { serverId: 'api-server-1' })
 * await adapter.join()
 *
 * @example
 * // Using with custom namespace
 * const adapter = await createPostgresAdapter(pool, {
 *     serverId: 'production-server-1',
 *     namespace: 'myapp'
 * })
 */

/**
 * @typedef {Object} PgPool
 * PostgreSQL connection pool from the `pg` package.
 *
 * @property {function(string, Array=): Promise<QueryResult>} query - Execute a query
 * @property {function(): Promise<PoolClient>} connect - Get a client from the pool
 */

/**
 * @typedef {Object} PoolClient
 * A client checked out from the PostgreSQL pool.
 *
 * @property {function(string, Array=): Promise<QueryResult>} query - Execute a query
 * @property {function(string, function): void} on - Subscribe to events (e.g., 'notification')
 * @property {function(): void} release - Return client to pool
 */

/**
 * @typedef {Object} QueryResult
 * Result from a PostgreSQL query.
 *
 * @property {Array<Object>} rows - Array of row objects
 * @property {number} rowCount - Number of rows affected/returned
 */

/**
 * @typedef {Object} Notification
 * PostgreSQL NOTIFY event object.
 *
 * @property {string} channel - The notification channel name
 * @property {string} payload - The notification payload (JSON string)
 */

/**
 * @typedef {Object} PostgresAdapterOptions
 * Configuration options for the PostgreSQL adapter.
 *
 * @property {string} serverId - This server's unique identifier (required)
 * @property {string} [namespace='ape'] - Table and channel prefix.
 *     The clients table will be `{namespace}_clients`.
 *     The NOTIFY channel will be `{namespace}_events`.
 */

/**
 * @typedef {Object} PostgresAdapterInstance
 * A configured PostgreSQL adapter instance for cluster coordination.
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
 * Creates a PostgreSQL adapter for APE cluster coordination.
 *
 * This function sets up PostgreSQL tables, indexes, and LISTEN/NOTIFY channels
 * to provide a unified interface for:
 * - Tracking which clients are connected to which servers
 * - Sending messages between servers in the cluster
 * - Broadcasting messages to all servers
 *
 * The adapter uses a state machine to ensure proper lifecycle management:
 * 1. INIT → JOINED: Call `join()` to start listening for messages
 * 2. JOINED → LEFT: Call `leave()` to clean up and disconnect
 * 3. Cannot transition from LEFT back to JOINED (create new adapter)
 *
 * **Important**: The LISTEN client is held for the lifetime of the adapter.
 * Make sure to call `leave()` on shutdown to properly release it back to the pool.
 *
 * @async
 * @function createPostgresAdapter
 * @param {PgPool} pool - PostgreSQL connection pool
 * @param {PostgresAdapterOptions} options - Configuration options
 * @param {string} options.serverId - This server's unique identifier
 * @param {string} [options.namespace='ape'] - Table/channel prefix
 * @returns {Promise<PostgresAdapterInstance>} Configured adapter instance
 * @throws {Error} If serverId is not provided
 *
 * @example
 * // Basic setup
 * const { Pool } = require('pg')
 * const pool = new Pool({ connectionString: 'postgresql://localhost/mydb' })
 *
 * const { createPostgresAdapter } = require('api-ape/server/adapters/postgres')
 * const adapter = await createPostgresAdapter(pool, {
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
 *     await pool.end()
 * })
 */
async function createPostgresAdapter(pool, { serverId, namespace = "ape" }) {
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
   * Dedicated PostgreSQL client for LISTEN.
   * Must be held for the lifetime of the subscription.
   * @type {PoolClient|null}
   * @private
   */
  let listenerClient = null;

  /**
   * Table name for client-to-server mappings.
   * @type {string}
   * @private
   */
  const clientsTable = `${namespace}_clients`;

  /**
   * Channel name for NOTIFY events.
   * @type {string}
   * @private
   */
  const eventsChannel = `${namespace}_events`;

  /**
   * Ensures required schema exists in the database.
   * Creates the clients table and indexes if they don't exist.
   *
   * @async
   * @private
   * @function ensureSchema
   * @returns {Promise<void>}
   */
  async function ensureSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${clientsTable} (
        client_id VARCHAR(255) PRIMARY KEY,
        server_id VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_${clientsTable}_server_id
        ON ${clientsTable}(server_id);
    `);
  }

  /**
   * The adapter instance with all public methods.
   * @type {PostgresAdapterInstance}
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
     * - Database schema (creates table if not exists)
     * - Dedicated client for LISTEN
     * - Notification handler for incoming messages
     *
     * The LISTEN client is held for the lifetime of the subscription.
     * All servers in the cluster use the same channel, filtering by
     * targetServerId in the message payload.
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

      await ensureSchema();

      // Create dedicated client for LISTEN (must be held for subscription lifetime)
      listenerClient = await pool.connect();

      // Subscribe to NOTIFY events
      await listenerClient.query(`LISTEN ${eventsChannel}`);

      // Handle incoming notifications
      listenerClient.on("notification", (msg) => {
        try {
          const data = JSON.parse(msg.payload);

          // Check if message is for us or broadcast
          if (data.targetServerId === sid || data.targetServerId === "") {
            const handler =
              handlers.get(data.targetServerId) || handlers.get("");
            if (handler) {
              handler(data.message, data.senderServerId);
            }
          }
        } catch (e) {
          console.error(
            "📛 Postgres adapter: failed to parse notification",
            e.message,
          );
        }
      });

      state = "JOINED";
      console.log(`✅ Postgres adapter: joined as ${sid}`);
    },

    /**
     * Leave the cluster and clean up all resources.
     *
     * This method:
     * 1. UNLISTENs from the notification channel
     * 2. Releases the dedicated listener client back to the pool
     * 3. Removes all client mappings owned by this server
     * 4. Transitions to LEFT state (cannot rejoin)
     *
     * @async
     * @returns {Promise<void>}
     *
     * @example
     * // Clean shutdown
     * process.on('SIGTERM', async () => {
     *     await adapter.leave()
     *     await pool.end()
     *     process.exit(0)
     * })
     */
    async leave() {
      if (state !== "JOINED") return;
      state = "LEFT";

      console.log(
        `🔴 Postgres adapter: leaving, cleaning up ${ownedClients.size} clients`,
      );

      // Unlisten and release client
      if (listenerClient) {
        try {
          await listenerClient.query(`UNLISTEN ${eventsChannel}`);
          listenerClient.release();
        } catch (e) {
          // Ignore disconnect errors (connection may already be closed)
        }
        listenerClient = null;
      }

      // Remove all owned client mappings in a single query
      if (ownedClients.size > 0) {
        const ids = Array.from(ownedClients);
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
        await pool.query(
          `DELETE FROM ${clientsTable} WHERE client_id IN (${placeholders})`,
          ids,
        );
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
       * Uses INSERT ON CONFLICT to handle reconnections gracefully.
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
        await pool.query(
          `INSERT INTO ${clientsTable} (client_id, server_id, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (client_id) DO UPDATE SET server_id = $2, updated_at = NOW()`,
          [clientId, serverId],
        );
        ownedClients.add(clientId);
        console.log(
          `📍 Postgres adapter: registered client ${clientId} -> ${serverId}`,
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
        const result = await pool.query(
          `SELECT server_id FROM ${clientsTable} WHERE client_id = $1`,
          [clientId],
        );
        return result.rows[0]?.server_id || null;
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
        await pool.query(`DELETE FROM ${clientsTable} WHERE client_id = $1`, [
          clientId,
        ]);
        ownedClients.delete(clientId);
        console.log(`🗑️ Postgres adapter: removed client ${clientId}`);
      },
    },

    /**
     * Inter-server messaging operations.
     * Used to send messages between servers in the cluster.
     */
    channels: {
      /**
       * Send a message to a specific server or broadcast to all.
       * Uses PostgreSQL's pg_notify function to send the message.
       *
       * **Warning**: NOTIFY payloads are limited to approximately 8000 bytes.
       * For larger messages, consider:
       * - Splitting the message
       * - Using a table-based queue
       * - Using an external message broker
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
        const payload = JSON.stringify({
          targetServerId: targetServerId || "",
          senderServerId: serverId,
          message,
        });

        // NOTIFY has ~8000 byte limit - warn for large payloads
        if (payload.length > 7500) {
          console.warn(
            "⚠️ Postgres adapter: payload too large for NOTIFY, consider using smaller messages",
          );
        }

        await pool.query(`SELECT pg_notify($1, $2)`, [eventsChannel, payload]);

        if (targetServerId) {
          console.log(
            `📤 Postgres adapter: pushed to server ${targetServerId}`,
          );
        } else {
          console.log(`📢 Postgres adapter: broadcast to all servers`);
        }
      },

      /**
       * Subscribe to messages for a specific channel.
       *
       * Note: The actual PostgreSQL LISTEN is set up during `join()`.
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

module.exports = { createPostgresAdapter };
