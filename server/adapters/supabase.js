/**
 * @fileoverview Supabase Adapter for APE Cluster
 *
 * This adapter enables multi-server api-ape deployments using Supabase as the
 * coordination backend. Supabase provides a simplified interface over PostgreSQL
 * with built-in Realtime channels for instant message delivery.
 *
 * Features:
 * - **Real-time messaging**: Uses Supabase Realtime broadcast for instant delivery
 * - **Simple API**: Leverages Supabase's intuitive client SDK
 * - **Serverless-ready**: Works great with Supabase Edge Functions
 * - **State machine**: Prevents invalid state transitions (INIT → JOINED → LEFT)
 *
 * Required Database Schema (create via Supabase Dashboard or migrations):
 * ```sql
 * CREATE TABLE {namespace}_clients (
 *   client_id TEXT PRIMARY KEY,
 *   server_id TEXT NOT NULL,
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 *
 * -- Optional: Enable Row Level Security
 * ALTER TABLE {namespace}_clients ENABLE ROW LEVEL SECURITY;
 * ```
 *
 * **Note**: Unlike other adapters, Supabase requires pre-created tables.
 * The adapter will validate table existence but not create them.
 *
 * @module server/adapters/supabase
 * @see {@link module:server/adapters} - Main adapter factory
 * @see {@link https://supabase.com/docs/guides/realtime} - Supabase Realtime documentation
 *
 * @example
 * // Basic setup with Supabase client
 * const { createClient } = require('@supabase/supabase-js')
 * const supabase = createClient(
 *     process.env.SUPABASE_URL,
 *     process.env.SUPABASE_SERVICE_ROLE_KEY
 * )
 *
 * const { createSupabaseAdapter } = require('api-ape/server/adapters/supabase')
 * const adapter = await createSupabaseAdapter(supabase, { serverId: 'api-server-1' })
 * await adapter.join()
 *
 * @example
 * // Using with custom namespace
 * const adapter = await createSupabaseAdapter(supabase, {
 *     serverId: 'production-server-1',
 *     namespace: 'myapp'
 * })
 */

/**
 * @typedef {Object} SupabaseClient
 * Supabase client instance from `@supabase/supabase-js`.
 *
 * @property {function(string): SupabaseQueryBuilder} from - Get a table query builder
 * @property {function(string): RealtimeChannel} channel - Create a realtime channel
 * @property {function(RealtimeChannel): Promise<void>} removeChannel - Remove a channel subscription
 */

/**
 * @typedef {Object} SupabaseQueryBuilder
 * Query builder for Supabase table operations.
 *
 * @property {function(string): SupabaseQueryBuilder} select - Select columns
 * @property {function(Object): SupabaseQueryBuilder} upsert - Upsert a row
 * @property {function(): SupabaseQueryBuilder} delete - Delete rows
 * @property {function(string, any): SupabaseQueryBuilder} eq - Filter by equality
 * @property {function(string, Array): SupabaseQueryBuilder} in - Filter by array inclusion
 * @property {function(): SupabaseQueryBuilder} single - Return single row
 * @property {function(number): SupabaseQueryBuilder} limit - Limit results
 */

/**
 * @typedef {Object} RealtimeChannel
 * Supabase Realtime channel for pub/sub messaging.
 *
 * @property {function(string, Object, function): RealtimeChannel} on - Subscribe to events
 * @property {function(): RealtimeChannel} subscribe - Activate the subscription
 * @property {function(Object): Promise<void>} send - Send a message
 */

/**
 * @typedef {Object} SupabaseAdapterOptions
 * Configuration options for the Supabase adapter.
 *
 * @property {string} serverId - This server's unique identifier (required)
 * @property {string} [namespace='ape'] - Table and channel prefix.
 *     The clients table will be `{namespace}_clients`.
 *     Channel names will be `{namespace}:{serverId}`.
 */

/**
 * @typedef {Object} SupabaseAdapterInstance
 * A configured Supabase adapter instance for cluster coordination.
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
 * Creates a Supabase adapter for APE cluster coordination.
 *
 * This function sets up Supabase Realtime channels and provides a unified
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
 * **Important**: The required tables must be created before using this adapter.
 * Supabase doesn't support dynamic table creation through the client SDK.
 * Create the tables via the Supabase Dashboard or database migrations.
 *
 * @async
 * @function createSupabaseAdapter
 * @param {SupabaseClient} supabase - Supabase client instance
 * @param {SupabaseAdapterOptions} options - Configuration options
 * @param {string} options.serverId - This server's unique identifier
 * @param {string} [options.namespace='ape'] - Table/channel prefix
 * @returns {Promise<SupabaseAdapterInstance>} Configured adapter instance
 * @throws {Error} If serverId is not provided
 * @throws {Error} If required tables don't exist
 *
 * @example
 * // Basic setup
 * const { createClient } = require('@supabase/supabase-js')
 * const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
 *
 * const { createSupabaseAdapter } = require('api-ape/server/adapters/supabase')
 * const adapter = await createSupabaseAdapter(supabase, {
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
 * })
 */
async function createSupabaseAdapter(
  supabase,
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
   * Primary Supabase Realtime channel for this server.
   * @type {RealtimeChannel|null}
   * @private
   */
  let realtimeChannel = null;

  /**
   * Table name for client-to-server mappings.
   * @type {string}
   * @private
   */
  const clientsTable = `${namespace}_clients`;

  /**
   * Table name for events (optional, for persistence).
   * @type {string}
   * @private
   */
  const eventsTable = `${namespace}_events`;

  /**
   * Validates that required tables exist in Supabase.
   * Supabase requires tables to be created via Dashboard or migrations,
   * so we can only check for existence, not create them.
   *
   * @async
   * @private
   * @function validateTables
   * @returns {Promise<void>}
   * @throws {Error} If the clients table doesn't exist
   */
  async function validateTables() {
    const { error: clientsError } = await supabase
      .from(clientsTable)
      .select("client_id")
      .limit(1);

    if (clientsError && clientsError.code === "42P01") {
      throw new Error(
        `Table "${clientsTable}" does not exist. ` +
          `Create it with: CREATE TABLE ${clientsTable} (client_id TEXT PRIMARY KEY, server_id TEXT NOT NULL);`,
      );
    }
  }

  /**
   * The adapter instance with all public methods.
   * @type {SupabaseAdapterInstance}
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
     * Sets up Supabase Realtime channels:
     * - This server's direct message channel (`{namespace}:{serverId}`)
     * - The broadcast channel (`{namespace}:ALL`)
     *
     * Messages are delivered via Supabase Realtime broadcast events.
     *
     * @async
     * @param {string} [id] - Optional server ID override (defaults to constructor serverId)
     * @returns {Promise<void>}
     * @throws {Error} If already joined or previously left
     * @throws {Error} If required tables don't exist
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

      await validateTables();

      // Subscribe to Realtime channel for this server's direct messages
      realtimeChannel = supabase
        .channel(`${namespace}:${sid}`)
        .on("broadcast", { event: "message" }, ({ payload }) => {
          const { targetServerId, message, senderServerId } = payload;

          // Check if message is for us or broadcast
          if (targetServerId === sid || targetServerId === "") {
            const handler = handlers.get(targetServerId) || handlers.get("");
            if (handler) {
              handler(message, senderServerId);
            }
          }
        })
        .subscribe();

      // Also subscribe to broadcast channel (ALL)
      supabase
        .channel(`${namespace}:ALL`)
        .on("broadcast", { event: "message" }, ({ payload }) => {
          const { message, senderServerId } = payload;
          const handler = handlers.get("");
          if (handler) {
            handler(message, senderServerId);
          }
        })
        .subscribe();

      state = "JOINED";
      console.log(`✅ Supabase adapter: joined as ${sid}`);
    },

    /**
     * Leave the cluster and clean up all resources.
     *
     * This method:
     * 1. Unsubscribes from Supabase Realtime channels
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
     *     process.exit(0)
     * })
     */
    async leave() {
      if (state !== "JOINED") return;
      state = "LEFT";

      console.log(
        `🔴 Supabase adapter: leaving, cleaning up ${ownedClients.size} clients`,
      );

      // Unsubscribe from channels
      if (realtimeChannel) {
        await supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }

      // Remove all owned client mappings in a single query
      if (ownedClients.size > 0) {
        const ids = Array.from(ownedClients);
        await supabase.from(clientsTable).delete().in("client_id", ids);
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
       * @throws {Error} If the upsert operation fails
       *
       * @example
       * // When a client connects
       * ws.on('connection', async (socket) => {
       *     const clientId = generateClientId()
       *     await adapter.lookup.add(clientId)
       * })
       */
      async add(clientId) {
        const { error } = await supabase.from(clientsTable).upsert({
          client_id: clientId,
          server_id: serverId,
          updated_at: new Date().toISOString(),
        });

        if (error)
          throw new Error(`Supabase lookup.add failed: ${error.message}`);

        ownedClients.add(clientId);
        console.log(
          `📍 Supabase adapter: registered client ${clientId} -> ${serverId}`,
        );
      },

      /**
       * Look up which server owns a client.
       *
       * @async
       * @param {string} clientId - The client's unique identifier
       * @returns {Promise<string|null>} Server ID owning the client, or null if not found
       * @throws {Error} If the query fails (excluding "not found")
       *
       * @example
       * // Route message to correct server
       * const targetServer = await adapter.lookup.read(targetClientId)
       * if (targetServer && targetServer !== adapter.serverId) {
       *     await adapter.channels.push(targetServer, message)
       * }
       */
      async read(clientId) {
        const { data, error } = await supabase
          .from(clientsTable)
          .select("server_id")
          .eq("client_id", clientId)
          .single();

        // PGRST116 is "not found" - not an error
        if (error && error.code !== "PGRST116") {
          throw new Error(`Supabase lookup.read failed: ${error.message}`);
        }

        return data?.server_id || null;
      },

      /**
       * Remove a client mapping.
       * Can only remove clients owned by this server (security).
       *
       * @async
       * @param {string} clientId - The client's unique identifier
       * @returns {Promise<void>}
       * @throws {Error} If this server doesn't own the client
       * @throws {Error} If the delete operation fails
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

        const { error } = await supabase
          .from(clientsTable)
          .delete()
          .eq("client_id", clientId);

        if (error)
          throw new Error(`Supabase lookup.remove failed: ${error.message}`);

        ownedClients.delete(clientId);
        console.log(`🗑️ Supabase adapter: removed client ${clientId}`);
      },
    },

    /**
     * Inter-server messaging operations.
     * Used to send messages between servers in the cluster.
     */
    channels: {
      /**
       * Send a message to a specific server or broadcast to all.
       * Uses Supabase Realtime broadcast to deliver the message.
       *
       * @async
       * @param {string} targetServerId - Target server ID, or empty string for broadcast
       * @param {Object} message - Message payload
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
        const channelName = targetServerId
          ? `${namespace}:${targetServerId}`
          : `${namespace}:ALL`;

        const channel = supabase.channel(channelName);

        await channel.send({
          type: "broadcast",
          event: "message",
          payload: {
            targetServerId: targetServerId || "",
            senderServerId: serverId,
            message,
          },
        });

        if (targetServerId) {
          console.log(
            `📤 Supabase adapter: pushed to server ${targetServerId}`,
          );
        } else {
          console.log(`📢 Supabase adapter: broadcast to all servers`);
        }
      },

      /**
       * Subscribe to messages for a specific channel.
       *
       * Note: The actual Supabase subscription is set up during `join()`.
       * This method registers a handler for filtering incoming messages.
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

module.exports = { createSupabaseAdapter };
