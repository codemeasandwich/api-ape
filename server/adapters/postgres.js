/**
 * PostgreSQL Adapter for APE Cluster
 * 
 * Uses PostgreSQL LISTEN/NOTIFY for real-time inter-server messaging.
 * Client mappings stored in a dedicated table.
 */

/**
 * Create PostgreSQL adapter
 * @param {pg.Pool} pool - PostgreSQL connection pool
 * @param {object} opts
 * @param {string} opts.serverId - This server's unique ID
 * @param {string} [opts.namespace='ape'] - Table prefix
 * @returns {Promise<AdapterInstance>}
 */
async function createPostgresAdapter(pool, { serverId, namespace = 'ape' }) {
    if (!serverId) throw new Error('serverId required');

    // State machine: INIT -> JOINED -> LEFT
    let state = 'INIT';
    const ownedClients = new Set();
    const handlers = new Map();
    let listenerClient = null;

    // Table and channel names
    const clientsTable = `${namespace}_clients`;
    const eventsChannel = `${namespace}_events`;

    // Ensure schema
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

    const adapter = {
        get serverId() { return serverId; },

        async join(id) {
            const sid = id || serverId;
            if (!sid?.trim()) throw new Error('serverId required');
            if (state === 'JOINED') throw new Error('already joined');
            if (state === 'LEFT') throw new Error('cannot rejoin after leave');

            await ensureSchema();

            // Create dedicated client for LISTEN
            listenerClient = await pool.connect();

            // Subscribe to NOTIFY events
            await listenerClient.query(`LISTEN ${eventsChannel}`);

            listenerClient.on('notification', (msg) => {
                try {
                    const data = JSON.parse(msg.payload);

                    // Check if message is for us or broadcast
                    if (data.targetServerId === sid || data.targetServerId === '') {
                        const handler = handlers.get(data.targetServerId) || handlers.get('');
                        if (handler) {
                            handler(data.message, data.senderServerId);
                        }
                    }
                } catch (e) {
                    console.error('📛 Postgres adapter: failed to parse notification', e.message);
                }
            });

            state = 'JOINED';
            console.log(`✅ Postgres adapter: joined as ${sid}`);
        },

        async leave() {
            if (state !== 'JOINED') return;
            state = 'LEFT';

            console.log(`🔴 Postgres adapter: leaving, cleaning up ${ownedClients.size} clients`);

            // Unlisten and release client
            if (listenerClient) {
                try {
                    await listenerClient.query(`UNLISTEN ${eventsChannel}`);
                    listenerClient.release();
                } catch (e) {
                    // Ignore disconnect errors
                }
                listenerClient = null;
            }

            // Remove all owned client mappings
            if (ownedClients.size > 0) {
                const ids = Array.from(ownedClients);
                const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
                await pool.query(
                    `DELETE FROM ${clientsTable} WHERE client_id IN (${placeholders})`,
                    ids
                );
            }
            ownedClients.clear();
        },

        lookup: {
            async add(clientId) {
                await pool.query(
                    `INSERT INTO ${clientsTable} (client_id, server_id, updated_at) 
           VALUES ($1, $2, NOW())
           ON CONFLICT (client_id) DO UPDATE SET server_id = $2, updated_at = NOW()`,
                    [clientId, serverId]
                );
                ownedClients.add(clientId);
                console.log(`📍 Postgres adapter: registered client ${clientId} -> ${serverId}`);
            },

            async read(clientId) {
                const result = await pool.query(
                    `SELECT server_id FROM ${clientsTable} WHERE client_id = $1`,
                    [clientId]
                );
                return result.rows[0]?.server_id || null;
            },

            async remove(clientId) {
                if (!ownedClients.has(clientId)) {
                    throw new Error(`not owner: cannot remove client ${clientId}`);
                }
                await pool.query(
                    `DELETE FROM ${clientsTable} WHERE client_id = $1`,
                    [clientId]
                );
                ownedClients.delete(clientId);
                console.log(`🗑️ Postgres adapter: removed client ${clientId}`);
            }
        },

        channels: {
            async push(targetServerId, message) {
                const payload = JSON.stringify({
                    targetServerId: targetServerId || '',
                    senderServerId: serverId,
                    message
                });

                // NOTIFY has 8000 byte limit - for larger payloads, use table
                if (payload.length > 7500) {
                    console.warn('⚠️ Postgres adapter: payload too large for NOTIFY, consider using smaller messages');
                }

                await pool.query(`SELECT pg_notify($1, $2)`, [eventsChannel, payload]);

                if (targetServerId) {
                    console.log(`📤 Postgres adapter: pushed to server ${targetServerId}`);
                } else {
                    console.log(`📢 Postgres adapter: broadcast to all servers`);
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

module.exports = { createPostgresAdapter };
