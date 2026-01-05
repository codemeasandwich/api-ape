/**
 * Redis Adapter for APE Cluster
 * 
 * Uses Redis PUB/SUB for real-time inter-server messaging.
 * Client mappings stored as simple key-value pairs.
 */

/**
 * Create Redis adapter
 * @param {object} redis - Redis client (node-redis or ioredis)
 * @param {object} opts
 * @param {string} opts.serverId - This server's unique ID
 * @param {string} [opts.namespace='ape'] - Key prefix
 * @returns {Promise<AdapterInstance>}
 */
async function createRedisAdapter(redis, { serverId, namespace = 'ape' }) {
    if (!serverId) throw new Error('serverId required');

    // State machine: INIT -> JOINED -> LEFT
    let state = 'INIT';
    const ownedClients = new Set();
    const handlers = new Map();

    // Create dedicated pub/sub connections
    const pub = redis.duplicate();
    const sub = redis.duplicate();

    // Key helpers
    const key = {
        client: (id) => `${namespace}:client:${id}`,
        channel: (id) => `${namespace}:channel:${id || 'ALL'}`,
    };

    // Connect pub/sub clients
    if (typeof pub.connect === 'function' && pub.isOpen === false) {
        await pub.connect();
    }
    if (typeof sub.connect === 'function' && sub.isOpen === false) {
        await sub.connect();
    }

    // Handle incoming messages (node-redis v4 style)
    if (typeof sub.on === 'function') {
        sub.on('message', (channel, message) => {
            try {
                const data = JSON.parse(message);
                // Find matching handler
                for (const [pattern, handler] of handlers) {
                    if (channel === key.channel(pattern) || channel === key.channel('')) {
                        handler(data, data._senderServerId || serverId);
                    }
                }
            } catch (e) {
                console.error('📛 Redis adapter: failed to parse message', e.message);
            }
        });
    }

    const adapter = {
        get serverId() { return serverId; },

        async join(id) {
            const sid = id || serverId;
            if (!sid?.trim()) throw new Error('serverId required');
            if (state === 'JOINED') throw new Error('already joined');
            if (state === 'LEFT') throw new Error('cannot rejoin after leave');

            // Subscribe to this server's channel + broadcast channel
            await sub.subscribe(key.channel(sid));
            await sub.subscribe(key.channel(''));

            state = 'JOINED';
            console.log(`✅ Redis adapter: joined as ${sid}`);
        },

        async leave() {
            if (state !== 'JOINED') return;
            state = 'LEFT';

            console.log(`🔴 Redis adapter: leaving, cleaning up ${ownedClients.size} clients`);

            // Remove all owned client mappings
            for (const clientId of ownedClients) {
                try {
                    await pub.del(key.client(clientId));
                } catch (e) {
                    console.error(`📛 Redis adapter: failed to remove client ${clientId}`, e.message);
                }
            }
            ownedClients.clear();

            // Unsubscribe and disconnect
            try {
                await sub.unsubscribe();
                await pub.quit();
                await sub.quit();
            } catch (e) {
                // Ignore disconnect errors
            }
        },

        lookup: {
            async add(clientId) {
                await pub.set(key.client(clientId), serverId);
                ownedClients.add(clientId);
                console.log(`📍 Redis adapter: registered client ${clientId} -> ${serverId}`);
            },

            async read(clientId) {
                const result = await pub.get(key.client(clientId));
                return result || null;
            },

            async remove(clientId) {
                if (!ownedClients.has(clientId)) {
                    throw new Error(`not owner: cannot remove client ${clientId}`);
                }
                await pub.del(key.client(clientId));
                ownedClients.delete(clientId);
                console.log(`🗑️ Redis adapter: removed client ${clientId}`);
            }
        },

        channels: {
            async push(targetServerId, message) {
                const channel = key.channel(targetServerId);
                const payload = JSON.stringify({
                    ...message,
                    _senderServerId: serverId
                });
                await pub.publish(channel, payload);

                if (targetServerId) {
                    console.log(`📤 Redis adapter: pushed to server ${targetServerId}`);
                } else {
                    console.log(`📢 Redis adapter: broadcast to all servers`);
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

module.exports = { createRedisAdapter };
