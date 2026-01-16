/**
 * @fileoverview Firebase Realtime Database Adapter for APE Cluster
 *
 * This adapter enables multi-server api-ape deployments using Firebase Realtime Database
 * as the coordination backend. Firebase RTDB provides native real-time push capabilities
 * via `onValue` and `onChildAdded` listeners, making it ideal for serverless and edge
 * deployments where traditional databases may not be available.
 *
 * Features:
 * - **Real-time messaging**: Uses Firebase's native push notifications for instant delivery
 * - **Serverless-friendly**: Works well with Cloud Functions, Vercel Edge, Cloudflare Workers
 * - **Auto-cleanup**: Messages are automatically cleaned up after processing
 * - **State machine**: Prevents invalid state transitions (INIT → JOINED → LEFT)
 *
 * Data Structure in Firebase:
 * ```
 * {namespace}/
 *   clients/
 *     {clientId}/
 *       serverId: "server-xyz"
 *       updatedAt: 1234567890
 *   channels/
 *     {serverId}/
 *       {pushId}/
 *         targetServerId: "server-xyz"
 *         senderServerId: "server-abc"
 *         message: {...}
 *         timestamp: 1234567890
 *     ALL/
 *       {pushId}/
 *         ...broadcast messages...
 * ```
 *
 * @module server/adapters/firebase
 * @see {@link module:server/adapters} - Main adapter factory
 * @see {@link https://firebase.google.com/docs/database} - Firebase RTDB documentation
 *
 * @example
 * // Using with firebase-admin (Node.js server)
 * const admin = require('firebase-admin')
 * admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
 * const database = admin.database()
 *
 * const { createFirebaseAdapter } = require('api-ape/server/adapters/firebase')
 * const adapter = await createFirebaseAdapter(database, { serverId: 'server-1' })
 * await adapter.join()
 *
 * @example
 * // Using with firebase client SDK (client-side or hybrid)
 * import { getDatabase } from 'firebase/database'
 * const database = getDatabase(app)
 *
 * const adapter = await createFirebaseAdapter(database, {
 *     serverId: 'edge-server-1',
 *     namespace: 'production'
 * })
 */

/**
 * @typedef {Object} FirebaseDatabase
 * Firebase Realtime Database instance. Can be either:
 * - firebase-admin: `admin.database()` - Server-side SDK
 * - firebase client: `getDatabase(app)` - Client/modular SDK
 *
 * @property {function(string): DatabaseReference} ref - Get a reference to a path
 * @property {function=} goOnline - Reconnect to database (admin SDK)
 * @property {Object=} app - Firebase app instance (client SDK)
 */

/**
 * @typedef {Object} DatabaseReference
 * Firebase database reference for a specific path.
 *
 * @property {function(string, function): function} on - Subscribe to events
 * @property {function(string, function): void} off - Unsubscribe from events
 * @property {function(string): Promise<DataSnapshot>} once - Read data once
 * @property {function(Object): Promise<void>} set - Write data
 * @property {function(Object): DatabaseReference} push - Push new child with auto-ID
 * @property {function(): Promise<void>} remove - Delete this reference
 */

/**
 * @typedef {Object} DataSnapshot
 * Firebase data snapshot from a read operation.
 *
 * @property {function(): any} val - Get the data value
 * @property {DatabaseReference} ref - Reference to this snapshot's location
 */

/**
 * @typedef {Object} FirebaseAdapterOptions
 * Configuration options for the Firebase adapter.
 *
 * @property {string} serverId - This server's unique identifier (required)
 * @property {string} [namespace='ape'] - Path prefix in Firebase for all data.
 *     Use different namespaces to run multiple api-ape clusters on the same database.
 */

/**
 * @typedef {Object} FirebaseAdapterInstance
 * A configured Firebase adapter instance for cluster coordination.
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
 * Creates a Firebase Realtime Database adapter for APE cluster coordination.
 *
 * This function sets up Firebase listeners and provides a unified interface for:
 * - Tracking which clients are connected to which servers
 * - Sending messages between servers in the cluster
 * - Broadcasting messages to all servers
 *
 * The adapter uses a state machine to ensure proper lifecycle management:
 * 1. INIT → JOINED: Call `join()` to start listening for messages
 * 2. JOINED → LEFT: Call `leave()` to clean up and disconnect
 * 3. Cannot transition from LEFT back to JOINED (create new adapter)
 *
 * @async
 * @function createFirebaseAdapter
 * @param {FirebaseDatabase} database - Firebase Realtime Database instance
 * @param {FirebaseAdapterOptions} options - Configuration options
 * @param {string} options.serverId - This server's unique identifier
 * @param {string} [options.namespace='ape'] - Path prefix for Firebase data
 * @returns {Promise<FirebaseAdapterInstance>} Configured adapter instance
 * @throws {Error} If serverId is not provided
 *
 * @example
 * // Basic setup with firebase-admin
 * const admin = require('firebase-admin')
 * admin.initializeApp()
 *
 * const { createFirebaseAdapter } = require('api-ape/server/adapters/firebase')
 * const adapter = await createFirebaseAdapter(admin.database(), {
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
async function createFirebaseAdapter(
  database,
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
   * Array of unsubscribe functions for Firebase listeners.
   * Called during `leave()` to clean up all subscriptions.
   * @type {Array<function(): void>}
   * @private
   */
  const unsubscribers = [];

  /**
   * Firebase path helpers.
   * Generates consistent paths for clients and channels.
   * @private
   */
  const paths = {
    /**
     * Get the path to the clients collection.
     * @returns {string} Firebase path
     */
    clients: () => `${namespace}/clients`,

    /**
     * Get the path to a specific client.
     * @param {string} id - Client ID
     * @returns {string} Firebase path
     */
    client: (id) => `${namespace}/clients/${id}`,

    /**
     * Get the path to a server's message channel.
     * Empty or null ID returns the broadcast channel "ALL".
     * @param {string|null} sid - Server ID or empty for broadcast
     * @returns {string} Firebase path
     */
    channel: (sid) => `${namespace}/channels/${sid || "ALL"}`,
  };

  /**
   * Get a database reference helper.
   * Supports both firebase-admin and firebase client SDK styles.
   *
   * @private
   * @function ref
   * @param {string} path - Firebase path
   * @returns {DatabaseReference} Database reference
   * @throws {Error} If database instance is unsupported
   */
  const ref = (path) => {
    // firebase-admin style (has .ref() method directly)
    if (typeof database.ref === "function") {
      return database.ref(path);
    }
    // firebase client SDK style (modular API)
    if (typeof database === "object" && database._checkNotDeleted) {
      const { ref: getRef } = require("firebase/database");
      return getRef(database, path);
    }
    throw new Error("Unsupported Firebase Database instance");
  };

  /**
   * The adapter instance with all public methods.
   * @type {FirebaseAdapterInstance}
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
     * Sets up Firebase listeners for:
     * - This server's direct message channel
     * - The broadcast channel (ALL)
     *
     * Messages are automatically cleaned up after processing:
     * - Direct messages: Deleted immediately after handling
     * - Broadcast messages: Deleted after 5 seconds (allows other servers to receive)
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

      // Listen to this server's direct message channel
      const serverChannelRef = ref(paths.channel(sid));
      const serverListener = serverChannelRef.on("child_added", (snapshot) => {
        const data = snapshot.val();
        if (data && data.senderServerId !== sid) {
          const handler = handlers.get(sid) || handlers.get("");
          if (handler) {
            handler(data.message, data.senderServerId);
          }
        }
        // Clean up processed message immediately
        snapshot.ref.remove();
      });
      unsubscribers.push(() =>
        serverChannelRef.off("child_added", serverListener),
      );

      // Listen to broadcast channel (ALL)
      const broadcastRef = ref(paths.channel(""));
      const broadcastListener = broadcastRef.on("child_added", (snapshot) => {
        const data = snapshot.val();
        if (data && data.senderServerId !== sid) {
          const handler = handlers.get("");
          if (handler) {
            handler(data.message, data.senderServerId);
          }
        }
        // Clean up broadcast message after delay (let other servers read it)
        setTimeout(() => snapshot.ref.remove(), 5000);
      });
      unsubscribers.push(() =>
        broadcastRef.off("child_added", broadcastListener),
      );

      state = "JOINED";
      console.log(`✅ Firebase adapter: joined as ${sid}`);
    },

    /**
     * Leave the cluster and clean up all resources.
     *
     * This method:
     * 1. Unsubscribes all Firebase listeners
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
        `🔴 Firebase adapter: leaving, cleaning up ${ownedClients.size} clients`,
      );

      // Unsubscribe all listeners
      for (const unsub of unsubscribers) {
        unsub();
      }
      unsubscribers.length = 0;

      // Remove all owned client mappings
      for (const clientId of ownedClients) {
        try {
          await ref(paths.client(clientId)).remove();
        } catch (e) {
          console.error(
            `Firebase: failed to remove client ${clientId}`,
            e.message,
          );
        }
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
       * Creates or updates the client mapping in Firebase.
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
        await ref(paths.client(clientId)).set({
          serverId,
          updatedAt: Date.now(),
        });
        ownedClients.add(clientId);
        console.log(
          `📍 Firebase adapter: registered client ${clientId} -> ${serverId}`,
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
        const snapshot = await ref(paths.client(clientId)).once("value");
        const data = snapshot.val();
        return data?.serverId || null;
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
        await ref(paths.client(clientId)).remove();
        ownedClients.delete(clientId);
        console.log(`🗑️ Firebase adapter: removed client ${clientId}`);
      },
    },

    /**
     * Inter-server messaging operations.
     * Used to send messages between servers in the cluster.
     */
    channels: {
      /**
       * Send a message to a specific server or broadcast to all.
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
        const channelRef = ref(paths.channel(targetServerId));

        await channelRef.push({
          targetServerId: targetServerId || "",
          senderServerId: serverId,
          message,
          timestamp: Date.now(),
        });

        if (targetServerId) {
          console.log(
            `📤 Firebase adapter: pushed to server ${targetServerId}`,
          );
        } else {
          console.log(`📢 Firebase adapter: broadcast to all servers`);
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

module.exports = { createFirebaseAdapter };
