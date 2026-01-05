/**
 * Supabase Adapter for APE Cluster
 * 
 * Uses Supabase Realtime for inter-server messaging.
 * Client mappings stored in a dedicated table.
 * 
 * Supabase is Postgres under the hood with a simpler Realtime API.
 */

/**
 * Create Supabase adapter
 * @param {SupabaseClient} supabase - Supabase client from @supabase/supabase-js
 * @param {object} opts
 * @param {string} opts.serverId - This server's unique ID
 * @param {string} [opts.namespace='ape'] - Table prefix
 * @returns {Promise<AdapterInstance>}
 */
async function createSupabaseAdapter(supabase, { serverId, namespace = 'ape' }) {
    if (!serverId) throw new Error('serverId required');

    // State machine: INIT -> JOINED -> LEFT
    let state = 'INIT';
    const ownedClients = new Set();
    const handlers = new Map();
    let realtimeChannel = null;

    // Table names
    const clientsTable = `${namespace}_clients`;
    const eventsTable = `${namespace}_events`;

    // Ensure tables exist (Supabase requires pre-created tables via migrations)
    // This is a validation check, not creation
    async function validateTables() {
        const { error: clientsError } = await supabase
            .from(clientsTable)
            .select('client_id')
            .limit(1);

        if (clientsError && clientsError.code === '42P01') {
            throw new Error(
                `Table "${clientsTable}" does not exist. ` +
                `Create it with: CREATE TABLE ${clientsTable} (client_id TEXT PRIMARY KEY, server_id TEXT NOT NULL);`
            );
        }
    }

    const adapter = {
        get serverId() { return serverId; },

        async join(id) {
            const sid = id || serverId;
            if (!sid?.trim()) throw new Error('serverId required');
            if (state === 'JOINED') throw new Error('already joined');
            if (state === 'LEFT') throw new Error('cannot rejoin after leave');

            await validateTables();

            // Subscribe to Realtime channel for this server + broadcast
            realtimeChannel = supabase
                .channel(`${namespace}:${sid}`)
                .on('broadcast', { event: 'message' }, ({ payload }) => {
                    const { targetServerId, message, senderServerId } = payload;

                    // Check if message is for us or broadcast
                    if (targetServerId === sid || targetServerId === '') {
                        const handler = handlers.get(targetServerId) || handlers.get('');
                        if (handler) {
                            handler(message, senderServerId);
                        }
                    }
                })
                .subscribe();

            // Also subscribe to broadcast channel
            supabase
                .channel(`${namespace}:ALL`)
                .on('broadcast', { event: 'message' }, ({ payload }) => {
                    const { message, senderServerId } = payload;
                    const handler = handlers.get('');
                    if (handler) {
                        handler(message, senderServerId);
                    }
                })
                .subscribe();

            state = 'JOINED';
            console.log(`✅ Supabase adapter: joined as ${sid}`);
        },

        async leave() {
            if (state !== 'JOINED') return;
            state = 'LEFT';

            console.log(`🔴 Supabase adapter: leaving, cleaning up ${ownedClients.size} clients`);

            // Unsubscribe from channels
            if (realtimeChannel) {
                await supabase.removeChannel(realtimeChannel);
                realtimeChannel = null;
            }

            // Remove all owned client mappings
            if (ownedClients.size > 0) {
                const ids = Array.from(ownedClients);
                await supabase
                    .from(clientsTable)
                    .delete()
                    .in('client_id', ids);
            }
            ownedClients.clear();
        },

        lookup: {
            async add(clientId) {
                const { error } = await supabase
                    .from(clientsTable)
                    .upsert({
                        client_id: clientId,
                        server_id: serverId,
                        updated_at: new Date().toISOString()
                    });

                if (error) throw new Error(`Supabase lookup.add failed: ${error.message}`);

                ownedClients.add(clientId);
                console.log(`📍 Supabase adapter: registered client ${clientId} -> ${serverId}`);
            },

            async read(clientId) {
                const { data, error } = await supabase
                    .from(clientsTable)
                    .select('server_id')
                    .eq('client_id', clientId)
                    .single();

                if (error && error.code !== 'PGRST116') { // PGRST116 = not found
                    throw new Error(`Supabase lookup.read failed: ${error.message}`);
                }

                return data?.server_id || null;
            },

            async remove(clientId) {
                if (!ownedClients.has(clientId)) {
                    throw new Error(`not owner: cannot remove client ${clientId}`);
                }

                const { error } = await supabase
                    .from(clientsTable)
                    .delete()
                    .eq('client_id', clientId);

                if (error) throw new Error(`Supabase lookup.remove failed: ${error.message}`);

                ownedClients.delete(clientId);
                console.log(`🗑️ Supabase adapter: removed client ${clientId}`);
            }
        },

        channels: {
            async push(targetServerId, message) {
                const channelName = targetServerId
                    ? `${namespace}:${targetServerId}`
                    : `${namespace}:ALL`;

                const channel = supabase.channel(channelName);

                await channel.send({
                    type: 'broadcast',
                    event: 'message',
                    payload: {
                        targetServerId: targetServerId || '',
                        senderServerId: serverId,
                        message
                    }
                });

                if (targetServerId) {
                    console.log(`📤 Supabase adapter: pushed to server ${targetServerId}`);
                } else {
                    console.log(`📢 Supabase adapter: broadcast to all servers`);
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

module.exports = { createSupabaseAdapter };
