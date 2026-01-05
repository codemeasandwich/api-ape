/**
 * Firebase Realtime Database Adapter for APE Cluster
 * 
 * Uses Firebase RTDB for real-time inter-server messaging.
 * Perfect for serverless and edge deployments.
 * 
 * Firebase provides native real-time push via onValue/onChildAdded listeners.
 */

/**
 * Create Firebase RTDB adapter
 * @param {Database} database - Firebase Realtime Database instance from firebase-admin or firebase
 * @param {object} opts
 * @param {string} opts.serverId - This server's unique ID
 * @param {string} [opts.namespace='ape'] - Path prefix
 * @returns {Promise<AdapterInstance>}
 */
async function createFirebaseAdapter(database, { serverId, namespace = 'ape' }) {
    if (!serverId) throw new Error('serverId required');

    // State machine: INIT -> JOINED -> LEFT
    let state = 'INIT';
    const ownedClients = new Set();
    const handlers = new Map();
    const unsubscribers = [];

    // Firebase path helpers
    const paths = {
        clients: () => `${namespace}/clients`,
        client: (id) => `${namespace}/clients/${id}`,
        channel: (sid) => `${namespace}/channels/${sid || 'ALL'}`,
    };

    // Get ref helper (works with both firebase-admin and firebase client SDK)
    const ref = (path) => {
        // firebase-admin style
        if (typeof database.ref === 'function') {
            return database.ref(path);
        }
        // firebase client SDK style (modular)
        if (typeof database === 'object' && database._checkNotDeleted) {
            const { ref: getRef } = require('firebase/database');
            return getRef(database, path);
        }
        throw new Error('Unsupported Firebase Database instance');
    };

    const adapter = {
        get serverId() { return serverId; },

        async join(id) {
            const sid = id || serverId;
            if (!sid?.trim()) throw new Error('serverId required');
            if (state === 'JOINED') throw new Error('already joined');
            if (state === 'LEFT') throw new Error('cannot rejoin after leave');

            // Listen to this server's channel
            const serverChannelRef = ref(paths.channel(sid));
            const serverListener = serverChannelRef.on('child_added', (snapshot) => {
                const data = snapshot.val();
                if (data && data.senderServerId !== sid) {
                    const handler = handlers.get(sid) || handlers.get('');
                    if (handler) {
                        handler(data.message, data.senderServerId);
                    }
                }
                // Clean up processed message
                snapshot.ref.remove();
            });
            unsubscribers.push(() => serverChannelRef.off('child_added', serverListener));

            // Listen to broadcast channel
            const broadcastRef = ref(paths.channel(''));
            const broadcastListener = broadcastRef.on('child_added', (snapshot) => {
                const data = snapshot.val();
                if (data && data.senderServerId !== sid) {
                    const handler = handlers.get('');
                    if (handler) {
                        handler(data.message, data.senderServerId);
                    }
                }
                // Clean up processed message after short delay (let other servers read it)
                setTimeout(() => snapshot.ref.remove(), 5000);
            });
            unsubscribers.push(() => broadcastRef.off('child_added', broadcastListener));

            state = 'JOINED';
            console.log(`✅ Firebase adapter: joined as ${sid}`);
        },

        async leave() {
            if (state !== 'JOINED') return;
            state = 'LEFT';

            console.log(`🔴 Firebase adapter: leaving, cleaning up ${ownedClients.size} clients`);

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
                    console.error(`Firebase: failed to remove client ${clientId}`, e.message);
                }
            }
            ownedClients.clear();
        },

        lookup: {
            async add(clientId) {
                await ref(paths.client(clientId)).set({
                    serverId,
                    updatedAt: Date.now()
                });
                ownedClients.add(clientId);
                console.log(`📍 Firebase adapter: registered client ${clientId} -> ${serverId}`);
            },

            async read(clientId) {
                const snapshot = await ref(paths.client(clientId)).once('value');
                const data = snapshot.val();
                return data?.serverId || null;
            },

            async remove(clientId) {
                if (!ownedClients.has(clientId)) {
                    throw new Error(`not owner: cannot remove client ${clientId}`);
                }
                await ref(paths.client(clientId)).remove();
                ownedClients.delete(clientId);
                console.log(`🗑️ Firebase adapter: removed client ${clientId}`);
            }
        },

        channels: {
            async push(targetServerId, message) {
                const channelRef = ref(paths.channel(targetServerId));

                await channelRef.push({
                    targetServerId: targetServerId || '',
                    senderServerId: serverId,
                    message,
                    timestamp: Date.now()
                });

                if (targetServerId) {
                    console.log(`📤 Firebase adapter: pushed to server ${targetServerId}`);
                } else {
                    console.log(`📢 Firebase adapter: broadcast to all servers`);
                }
            },

            async pull(targetServerId, handler) {
                handlers.set(targetServerId || '', handler);

                // Return unsubscribe function
                return async () => {
                    handlers.delete(targetServerId || '');
                };
            }
        }
    };

    return adapter;
}

module.exports = { createFirebaseAdapter };
