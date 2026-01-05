/**
 * Unit tests for server/adapters/index.js
 * Tests client type detection, adapter creation, and custom adapter wrapping
 */

const { createAdapter, detectClientType, uuid } = require('./index');

// =============================================================================
// MOCK CLIENTS - Simulate different database client types
// =============================================================================

const MOCK_CLIENTS = {
    // Redis client (node-redis style)
    redis: {
        duplicate: jest.fn(() => MOCK_CLIENTS.redis),
        publish: jest.fn(),
        subscribe: jest.fn(),
        connect: jest.fn(),
        quit: jest.fn(),
        on: jest.fn(),
        isOpen: true
    },

    // Redis client (ioredis style)
    ioredis: {
        duplicate: jest.fn(() => MOCK_CLIENTS.ioredis),
        publish: jest.fn(),
        subscribe: jest.fn(),
        connect: jest.fn(),
        quit: jest.fn(),
        on: jest.fn()
    },

    // MongoDB client
    mongo: {
        db: jest.fn(() => ({
            collection: jest.fn(() => ({
                createIndex: jest.fn(),
                updateOne: jest.fn(),
                findOne: jest.fn(),
                deleteOne: jest.fn(),
                deleteMany: jest.fn(),
                insertOne: jest.fn(),
                watch: jest.fn(() => ({
                    on: jest.fn(),
                    close: jest.fn()
                }))
            }))
        })),
        constructor: { name: 'MongoClient' }
    },

    // PostgreSQL pool
    postgres: {
        query: jest.fn(),
        connect: jest.fn(() => ({
            query: jest.fn(),
            on: jest.fn(),
            release: jest.fn()
        }))
    },

    // Custom adapter (already implements our interface)
    custom: {
        join: jest.fn(),
        leave: jest.fn(),
        lookup: {
            add: jest.fn(),
            read: jest.fn(),
            remove: jest.fn()
        },
        channels: {
            push: jest.fn(),
            pull: jest.fn()
        }
    },

    // Supabase client
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            upsert: jest.fn(),
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            limit: jest.fn()
        })),
        channel: jest.fn(() => ({
            on: jest.fn().mockReturnThis(),
            subscribe: jest.fn(),
            send: jest.fn()
        })),
        removeChannel: jest.fn()
    },

    // Firebase Realtime Database
    firebase: {
        ref: jest.fn(() => ({
            on: jest.fn(),
            off: jest.fn(),
            once: jest.fn(),
            set: jest.fn(),
            push: jest.fn(),
            remove: jest.fn()
        })),
        goOnline: jest.fn(),
        goOffline: jest.fn()
    },

    // Firebase with app property (alternate detection)
    firebaseWithApp: {
        ref: jest.fn(),
        app: { name: 'test-app' }
    },

    // Invalid clients
    invalidEmpty: null,
    invalidUndefined: undefined,
    invalidObject: { foo: 'bar' },
    invalidArray: [1, 2, 3],
    invalidString: 'not a client',
    invalidNumber: 42
};

// =============================================================================
// detectClientType TESTS
// =============================================================================

describe('detectClientType', () => {
    describe('Redis detection', () => {
        test('detects node-redis client', () => {
            expect(detectClientType(MOCK_CLIENTS.redis)).toBe('redis');
        });

        test('detects ioredis client', () => {
            expect(detectClientType(MOCK_CLIENTS.ioredis)).toBe('redis');
        });

        test('requires duplicate method', () => {
            const nodup = { publish: jest.fn() };
            expect(detectClientType(nodup)).toBe(null);
        });

        test('requires publish method', () => {
            const nopub = { duplicate: jest.fn() };
            expect(detectClientType(nopub)).toBe(null);
        });
    });

    describe('MongoDB detection', () => {
        test('detects MongoClient', () => {
            // Need to mock constructor name properly
            const mongoClient = {
                db: jest.fn()
            };
            Object.defineProperty(mongoClient.constructor, 'name', { value: 'MongoClient' });
            expect(detectClientType(mongoClient)).toBe('mongo');
        });

        test('requires db method', () => {
            const nodb = {
                connect: jest.fn()
            };
            Object.defineProperty(nodb.constructor, 'name', { value: 'MongoClient' });
            expect(detectClientType(nodb)).toBe(null);
        });
    });

    describe('PostgreSQL detection', () => {
        test('detects pg.Pool', () => {
            expect(detectClientType(MOCK_CLIENTS.postgres)).toBe('postgres');
        });

        test('requires query method', () => {
            const noquery = { connect: jest.fn() };
            expect(detectClientType(noquery)).toBe(null);
        });

        test('requires connect method', () => {
            const noconnect = { query: jest.fn() };
            expect(detectClientType(noconnect)).toBe(null);
        });
    });

    describe('Custom adapter detection', () => {
        test('detects complete custom adapter', () => {
            expect(detectClientType(MOCK_CLIENTS.custom)).toBe('custom');
        });

        test('requires join method', () => {
            const noJoin = {
                leave: jest.fn(),
                lookup: { add: jest.fn(), read: jest.fn(), remove: jest.fn() },
                channels: { push: jest.fn(), pull: jest.fn() }
            };
            expect(detectClientType(noJoin)).toBe(null);
        });

        test('requires leave method', () => {
            const noLeave = {
                join: jest.fn(),
                lookup: { add: jest.fn(), read: jest.fn(), remove: jest.fn() },
                channels: { push: jest.fn(), pull: jest.fn() }
            };
            expect(detectClientType(noLeave)).toBe(null);
        });

        test('requires lookup object', () => {
            const noLookup = {
                join: jest.fn(),
                leave: jest.fn(),
                channels: { push: jest.fn(), pull: jest.fn() }
            };
            expect(detectClientType(noLookup)).toBe(null);
        });

        test('requires channels object', () => {
            const noChannels = {
                join: jest.fn(),
                leave: jest.fn(),
                lookup: { add: jest.fn(), read: jest.fn(), remove: jest.fn() }
            };
            expect(detectClientType(noChannels)).toBe(null);
        });
    });

    describe('Supabase detection', () => {
        test('detects Supabase client', () => {
            expect(detectClientType(MOCK_CLIENTS.supabase)).toBe('supabase');
        });

        test('requires from method', () => {
            const noFrom = { channel: jest.fn() };
            expect(detectClientType(noFrom)).toBe(null);
        });

        test('requires channel method', () => {
            const noChannel = { from: jest.fn() };
            expect(detectClientType(noChannel)).toBe(null);
        });
    });

    describe('Firebase detection', () => {
        test('detects Firebase with goOnline', () => {
            expect(detectClientType(MOCK_CLIENTS.firebase)).toBe('firebase');
        });

        test('detects Firebase with app property', () => {
            expect(detectClientType(MOCK_CLIENTS.firebaseWithApp)).toBe('firebase');
        });

        test('requires ref method', () => {
            const noRef = { goOnline: jest.fn(), app: {} };
            expect(detectClientType(noRef)).toBe(null);
        });

        test('requires goOnline or app property', () => {
            const onlyRef = { ref: jest.fn() };
            expect(detectClientType(onlyRef)).toBe(null);
        });
    });

    describe('Invalid inputs', () => {
        test('returns null for null', () => {
            expect(detectClientType(null)).toBe(null);
        });

        test('returns null for undefined', () => {
            expect(detectClientType(undefined)).toBe(null);
        });

        test('returns null for empty object', () => {
            expect(detectClientType({})).toBe(null);
        });

        test('returns null for plain object', () => {
            expect(detectClientType(MOCK_CLIENTS.invalidObject)).toBe(null);
        });

        test('returns null for array', () => {
            expect(detectClientType(MOCK_CLIENTS.invalidArray)).toBe(null);
        });

        test('returns null for string', () => {
            expect(detectClientType(MOCK_CLIENTS.invalidString)).toBe(null);
        });

        test('returns null for number', () => {
            expect(detectClientType(MOCK_CLIENTS.invalidNumber)).toBe(null);
        });
    });
});

// =============================================================================
// uuid TESTS
// =============================================================================

describe('uuid', () => {
    test('generates 8 character string', () => {
        const id = uuid();
        expect(typeof id).toBe('string');
        expect(id.length).toBe(8);
    });

    test('uses valid character set (Crockford Base32)', () => {
        const validChars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        const id = uuid();
        for (const char of id) {
            expect(validChars).toContain(char);
        }
    });

    test('generates unique IDs', () => {
        const ids = new Set();
        for (let i = 0; i < 1000; i++) {
            ids.add(uuid());
        }
        // All 1000 should be unique
        expect(ids.size).toBe(1000);
    });

    test('generates different ID each call', () => {
        const id1 = uuid();
        const id2 = uuid();
        expect(id1).not.toBe(id2);
    });
});

// =============================================================================
// createAdapter TESTS
// =============================================================================

describe('createAdapter', () => {
    describe('Error handling', () => {
        test('throws for null client', async () => {
            await expect(createAdapter(null)).rejects.toThrow('Unable to detect database type');
        });

        test('throws for undefined client', async () => {
            await expect(createAdapter(undefined)).rejects.toThrow('Unable to detect database type');
        });

        test('throws for invalid object', async () => {
            await expect(createAdapter({ foo: 'bar' })).rejects.toThrow('Unable to detect database type');
        });

        test('error message includes supported types', async () => {
            await expect(createAdapter({})).rejects.toThrow(/Redis|MongoDB|PostgreSQL|custom/);
        });
    });

    describe('Custom adapter wrapping', () => {
        test('wraps custom adapter with serverId', async () => {
            const adapter = await createAdapter(MOCK_CLIENTS.custom, { serverId: 'test-srv' });
            expect(adapter.serverId).toBe('test-srv');
        });

        test('auto-generates serverId if not provided', async () => {
            const adapter = await createAdapter(MOCK_CLIENTS.custom);
            expect(typeof adapter.serverId).toBe('string');
            expect(adapter.serverId.length).toBe(8);
        });

        test('passes through join call', async () => {
            const custom = {
                join: jest.fn(),
                leave: jest.fn(),
                lookup: { add: jest.fn(), read: jest.fn(), remove: jest.fn() },
                channels: { push: jest.fn(), pull: jest.fn() }
            };
            const adapter = await createAdapter(custom, { serverId: 'srv-1' });
            await adapter.join();
            expect(custom.join).toHaveBeenCalledWith('srv-1');
        });

        test('passes through leave call', async () => {
            const custom = {
                join: jest.fn(),
                leave: jest.fn(),
                lookup: { add: jest.fn(), read: jest.fn(), remove: jest.fn() },
                channels: { push: jest.fn(), pull: jest.fn() }
            };
            const adapter = await createAdapter(custom, { serverId: 'srv-1' });
            await adapter.leave();
            expect(custom.leave).toHaveBeenCalled();
        });

        test('passes through lookup.add call', async () => {
            const custom = {
                join: jest.fn(),
                leave: jest.fn(),
                lookup: { add: jest.fn(), read: jest.fn(), remove: jest.fn() },
                channels: { push: jest.fn(), pull: jest.fn() }
            };
            const adapter = await createAdapter(custom);
            await adapter.lookup.add('client-123');
            expect(custom.lookup.add).toHaveBeenCalledWith('client-123');
        });

        test('passes through lookup.read call', async () => {
            const custom = {
                join: jest.fn(),
                leave: jest.fn(),
                lookup: { add: jest.fn(), read: jest.fn().mockResolvedValue('srv-x'), remove: jest.fn() },
                channels: { push: jest.fn(), pull: jest.fn() }
            };
            const adapter = await createAdapter(custom);
            const result = await adapter.lookup.read('client-123');
            expect(custom.lookup.read).toHaveBeenCalledWith('client-123');
            expect(result).toBe('srv-x');
        });

        test('passes through lookup.remove call', async () => {
            const custom = {
                join: jest.fn(),
                leave: jest.fn(),
                lookup: { add: jest.fn(), read: jest.fn(), remove: jest.fn() },
                channels: { push: jest.fn(), pull: jest.fn() }
            };
            const adapter = await createAdapter(custom);
            await adapter.lookup.remove('client-123');
            expect(custom.lookup.remove).toHaveBeenCalledWith('client-123');
        });

        test('passes through channels.push call', async () => {
            const custom = {
                join: jest.fn(),
                leave: jest.fn(),
                lookup: { add: jest.fn(), read: jest.fn(), remove: jest.fn() },
                channels: { push: jest.fn(), pull: jest.fn() }
            };
            const adapter = await createAdapter(custom);
            const msg = { type: 'test', data: {} };
            await adapter.channels.push('srv-target', msg);
            expect(custom.channels.push).toHaveBeenCalledWith('srv-target', msg);
        });

        test('passes through channels.pull call', async () => {
            const handler = jest.fn();
            const custom = {
                join: jest.fn(),
                leave: jest.fn(),
                lookup: { add: jest.fn(), read: jest.fn(), remove: jest.fn() },
                channels: { push: jest.fn(), pull: jest.fn() }
            };
            const adapter = await createAdapter(custom);
            await adapter.channels.pull('srv-1', handler);
            expect(custom.channels.pull).toHaveBeenCalledWith('srv-1', handler);
        });
    });

    describe('Options', () => {
        test('uses provided serverId', async () => {
            const adapter = await createAdapter(MOCK_CLIENTS.custom, { serverId: 'my-server' });
            expect(adapter.serverId).toBe('my-server');
        });

        test('generates unique serverId if not provided', async () => {
            const adapter1 = await createAdapter(MOCK_CLIENTS.custom);
            const adapter2 = await createAdapter(MOCK_CLIENTS.custom);
            expect(adapter1.serverId).not.toBe(adapter2.serverId);
        });

        test('namespace option is passed through (for actual adapters)', async () => {
            // This would need integration tests with actual adapters
            // For now, just verify it doesn't break
            const adapter = await createAdapter(MOCK_CLIENTS.custom, {
                serverId: 'srv',
                namespace: 'myapp'
            });
            expect(adapter.serverId).toBe('srv');
        });
    });
});

// =============================================================================
// ADAPTER INTERFACE TESTS
// =============================================================================

describe('Adapter Interface Contract', () => {
    test('wrapped adapter has all required methods', async () => {
        const adapter = await createAdapter(MOCK_CLIENTS.custom);

        // Lifecycle
        expect(typeof adapter.join).toBe('function');
        expect(typeof adapter.leave).toBe('function');

        // Lookup
        expect(typeof adapter.lookup.add).toBe('function');
        expect(typeof adapter.lookup.read).toBe('function');
        expect(typeof adapter.lookup.remove).toBe('function');

        // Channels
        expect(typeof adapter.channels.push).toBe('function');
        expect(typeof adapter.channels.pull).toBe('function');

        // ServerId getter
        expect(typeof adapter.serverId).toBe('string');
    });

    test('all methods return promises', async () => {
        const custom = {
            join: jest.fn().mockResolvedValue(undefined),
            leave: jest.fn().mockResolvedValue(undefined),
            lookup: {
                add: jest.fn().mockResolvedValue(undefined),
                read: jest.fn().mockResolvedValue(null),
                remove: jest.fn().mockResolvedValue(undefined)
            },
            channels: {
                push: jest.fn().mockResolvedValue(undefined),
                pull: jest.fn().mockResolvedValue(() => { })
            }
        };

        const adapter = await createAdapter(custom);

        expect(adapter.join()).toBeInstanceOf(Promise);
        expect(adapter.leave()).toBeInstanceOf(Promise);
        expect(adapter.lookup.add('c1')).toBeInstanceOf(Promise);
        expect(adapter.lookup.read('c1')).toBeInstanceOf(Promise);
        expect(adapter.lookup.remove('c1')).toBeInstanceOf(Promise);
        expect(adapter.channels.push('s1', {})).toBeInstanceOf(Promise);
        expect(adapter.channels.pull('s1', () => { })).toBeInstanceOf(Promise);
    });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
    test('handles async custom adapter methods', async () => {
        const custom = {
            join: jest.fn().mockImplementation(async () => {
                await new Promise(r => setTimeout(r, 10));
            }),
            leave: jest.fn().mockResolvedValue(undefined),
            lookup: { add: jest.fn(), read: jest.fn(), remove: jest.fn() },
            channels: { push: jest.fn(), pull: jest.fn() }
        };

        const adapter = await createAdapter(custom);
        await adapter.join();
        expect(custom.join).toHaveBeenCalled();
    });

    test('handles custom adapter that throws', async () => {
        const custom = {
            join: jest.fn().mockRejectedValue(new Error('connection failed')),
            leave: jest.fn(),
            lookup: { add: jest.fn(), read: jest.fn(), remove: jest.fn() },
            channels: { push: jest.fn(), pull: jest.fn() }
        };

        const adapter = await createAdapter(custom);
        await expect(adapter.join()).rejects.toThrow('connection failed');
    });

    test('serverId cannot be changed (getter only)', async () => {
        const adapter = await createAdapter(MOCK_CLIENTS.custom, { serverId: 'srv-1' });
        // Attempting to set has no effect (getter-only property)
        adapter.serverId = 'srv-2';
        expect(adapter.serverId).toBe('srv-1');
    });
});
