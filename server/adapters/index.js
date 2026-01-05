/**
 * APE Cluster Adapters
 * 
 * Detect database type and create appropriate adapter for multi-server coordination.
 * 
 * Usage:
 *   const adapter = await createAdapter(redisClient);
 *   const adapter = await createAdapter(mongoClient);
 *   const adapter = await createAdapter(pgPool);
 *   const adapter = await createAdapter(supabaseClient);
 *   const adapter = await createAdapter(firebaseDatabase);
 *   const adapter = await createAdapter(customAdapter);
 */

const { randomBytes } = require('crypto');

// Generate short unique server ID
const B = b => [...b].map(v => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[v & 31]).join('');
const uuid = () => B(randomBytes(8));

/**
 * Detect database type from client object
 * @param {object} client - Database client
 * @returns {'redis'|'mongo'|'postgres'|'supabase'|'firebase'|'custom'|null}
 */
function detectClientType(client) {
    if (!client) return null;

    // Custom adapter - has our interface methods
    if (typeof client.join === 'function' &&
        typeof client.leave === 'function' &&
        client.lookup && client.channels) {
        return 'custom';
    }

    // Redis (node-redis or ioredis)
    if (typeof client.duplicate === 'function' &&
        (typeof client.publish === 'function' || typeof client.PUBLISH === 'function')) {
        return 'redis';
    }

    // MongoDB
    if (typeof client.db === 'function' && client.constructor?.name === 'MongoClient') {
        return 'mongo';
    }

    // PostgreSQL (pg.Pool)
    if (typeof client.query === 'function' && typeof client.connect === 'function') {
        return 'postgres';
    }

    // Supabase (has .from() for tables and .channel() for realtime)
    if (typeof client.from === 'function' && typeof client.channel === 'function') {
        return 'supabase';
    }

    // Firebase Realtime Database (has .ref() method)
    if (typeof client.ref === 'function' &&
        (typeof client.goOnline === 'function' || client.app)) {
        return 'firebase';
    }

    return null;
}

/**
 * Create adapter from database client
 * @param {object} client - Database client or custom adapter
 * @param {object} opts - Options
 * @param {string} [opts.namespace='ape'] - Key/table prefix
 * @param {string} [opts.serverId] - Server ID (auto-generated if not provided)
 * @returns {Promise<AdapterInstance>}
 */
async function createAdapter(client, opts = {}) {
    const type = detectClientType(client);
    const serverId = opts.serverId || uuid();
    const namespace = opts.namespace || 'ape';

    if (!type) {
        throw new Error(
            'Unable to detect database type. Supported: Redis, MongoDB, PostgreSQL, Supabase, Firebase, or custom adapter.'
        );
    }

    console.log(`🔌 APE: Detected ${type} adapter (serverId: ${serverId})`);

    switch (type) {
        case 'custom':
            return wrapCustomAdapter(client, serverId);

        case 'redis':
            const { createRedisAdapter } = require('./redis');
            return createRedisAdapter(client, { serverId, namespace });

        case 'mongo':
            const { createMongoAdapter } = require('./mongo');
            return createMongoAdapter(client, { serverId, namespace });

        case 'postgres':
            const { createPostgresAdapter } = require('./postgres');
            return createPostgresAdapter(client, { serverId, namespace });

        case 'supabase':
            const { createSupabaseAdapter } = require('./supabase');
            return createSupabaseAdapter(client, { serverId, namespace });

        case 'firebase':
            const { createFirebaseAdapter } = require('./firebase');
            return createFirebaseAdapter(client, { serverId, namespace });

        default:
            throw new Error(`Unknown adapter type: ${type}`);
    }
}

/**
 * Attach serverId to custom adapter
 * @param {object} adapter - Custom adapter object  
 * @param {string} serverId - Server ID
 * @returns {AdapterInstance}
 */
function wrapCustomAdapter(adapter, serverId) {
    // Wrap to ensure consistent interface and default serverId
    return {
        get serverId() { return serverId; },
        join: (id) => adapter.join(id || serverId),
        leave: () => adapter.leave(),
        lookup: {
            add: (clientId) => adapter.lookup.add(clientId),
            read: (clientId) => adapter.lookup.read(clientId),
            remove: (clientId) => adapter.lookup.remove(clientId)
        },
        channels: {
            push: (targetServerId, message) => adapter.channels.push(targetServerId, message),
            pull: (targetServerId, handler) => adapter.channels.pull(targetServerId, handler)
        }
    };
}

module.exports = {
    createAdapter,
    detectClientType,
    uuid
};
