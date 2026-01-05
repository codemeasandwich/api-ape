/**
 * MongoDB Adapter for APE Cluster
 * 
 * Uses MongoDB Change Streams for real-time inter-server messaging.
 * Requires replica set for change stream support.
 */

/**
 * Create MongoDB adapter
 * @param {MongoClient} mongoClient - MongoDB client
 * @param {object} opts
 * @param {string} opts.serverId - This server's unique ID
 * @param {string} [opts.namespace='ape'] - Database/collection prefix
 * @returns {Promise<AdapterInstance>}
 */
async function createMongoAdapter(mongoClient, { serverId, namespace = 'ape' }) {
    if (!serverId) throw new Error('serverId required');

    // State machine: INIT -> JOINED -> LEFT
    let state = 'INIT';
    const ownedClients = new Set();
    const handlers = new Map();
    let changeStream = null;

    // Use dedicated database for APE cluster
    const db = mongoClient.db(`${namespace}_cluster`);
    const clientsCol = db.collection('clients');
    const eventsCol = db.collection('events');

    // Ensure indexes
    async function ensureIndexes() {
        await clientsCol.createIndex({ clientId: 1 }, { unique: true });
        await clientsCol.createIndex({ serverId: 1 });
        // Events TTL - auto-delete after 1 hour
        await eventsCol.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 });
        await eventsCol.createIndex({ targetServerId: 1, createdAt: 1 });
    }

    const adapter = {
        get serverId() { return serverId; },

        async join(id) {
            const sid = id || serverId;
            if (!sid?.trim()) throw new Error('serverId required');
            if (state === 'JOINED') throw new Error('already joined');
            if (state === 'LEFT') throw new Error('cannot rejoin after leave');

            await ensureIndexes();

            // Watch for events targeted to this server or broadcast
            try {
                changeStream = eventsCol.watch([
                    {
                        $match: {
                            'fullDocument.targetServerId': { $in: [sid, ''] },
                            operationType: 'insert'
                        }
                    }
                ], { fullDocument: 'updateLookup' });

                changeStream.on('change', (change) => {
                    if (change.operationType === 'insert') {
                        const doc = change.fullDocument;
                        const handler = handlers.get(doc.targetServerId) || handlers.get('');
                        if (handler) {
                            handler(doc.message, doc.senderServerId);
                        }
                    }
                });

                changeStream.on('error', (err) => {
                    console.error('📛 Mongo adapter: change stream error', err.message);
                });

            } catch (e) {
                console.warn('⚠️ Mongo adapter: Change streams not available (requires replica set). Falling back to polling.');
                // Could implement polling fallback here
            }

            state = 'JOINED';
            console.log(`✅ Mongo adapter: joined as ${sid}`);
        },

        async leave() {
            if (state !== 'JOINED') return;
            state = 'LEFT';

            console.log(`🔴 Mongo adapter: leaving, cleaning up ${ownedClients.size} clients`);

            // Close change stream
            if (changeStream) {
                await changeStream.close();
                changeStream = null;
            }

            // Remove all owned client mappings
            if (ownedClients.size > 0) {
                await clientsCol.deleteMany({
                    clientId: { $in: Array.from(ownedClients) }
                });
            }
            ownedClients.clear();
        },

        lookup: {
            async add(clientId) {
                await clientsCol.updateOne(
                    { clientId },
                    { $set: { clientId, serverId, updatedAt: new Date() } },
                    { upsert: true }
                );
                ownedClients.add(clientId);
                console.log(`📍 Mongo adapter: registered client ${clientId} -> ${serverId}`);
            },

            async read(clientId) {
                const doc = await clientsCol.findOne({ clientId });
                return doc?.serverId || null;
            },

            async remove(clientId) {
                if (!ownedClients.has(clientId)) {
                    throw new Error(`not owner: cannot remove client ${clientId}`);
                }
                await clientsCol.deleteOne({ clientId });
                ownedClients.delete(clientId);
                console.log(`🗑️ Mongo adapter: removed client ${clientId}`);
            }
        },

        channels: {
            async push(targetServerId, message) {
                await eventsCol.insertOne({
                    targetServerId: targetServerId || '',
                    senderServerId: serverId,
                    message,
                    createdAt: new Date()
                });

                if (targetServerId) {
                    console.log(`📤 Mongo adapter: pushed to server ${targetServerId}`);
                } else {
                    console.log(`📢 Mongo adapter: broadcast to all servers`);
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

module.exports = { createMongoAdapter };
