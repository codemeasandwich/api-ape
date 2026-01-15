/**
 * @fileoverview Cluster User Stories - Multi-server testing with FakeDatabase
 *
 * Tests Forest clustering functionality using the in-memory FakeDatabase:
 * - Multiple servers sharing a database
 * - Cross-server broadcasts
 * - Client lookup across servers
 *
 * @module simulator/scenarios/stories/cluster
 */

const { Harness } = require('../../../harness');

// Multi-Server Setup tests
const canCreateClusterOfServers = require('./multi-server-setup/can-create-cluster-of-servers');
const eachServerHasUniquePort = require('./multi-server-setup/each-server-has-unique-port');
const clientsCanConnectToDifferentServers = require('./multi-server-setup/clients-can-connect-to-different-servers');

// Shared FakeDatabase tests
const eachHarnessHasOwnFakeDatabaseInstance = require('./shared-fake-database/each-harness-has-own-fake-database-instance');
const clientsCanConnectToServersInCluster = require('./shared-fake-database/clients-can-connect-to-servers-in-cluster');

// Independent Server Operations tests
const rpcCallsWorkOnEachServerIndependently = require('./independent-server-operations/rpc-calls-work-on-each-server-independently');
const broadcastWithinSameServerWorks = require('./independent-server-operations/broadcast-within-same-server-works');

// Database Helpers tests
const getStateReturnsDatabaseState = require('./database-helpers/get-state-returns-database-state');
const resetClearsAllDatabaseState = require('./database-helpers/reset-clears-all-database-state');

// Server Lifecycle tests
const canCloseIndividualClusterServer = require('./server-lifecycle/can-close-individual-cluster-server');
const cleanupClosesAllClusterServers = require('./server-lifecycle/cleanup-closes-all-cluster-servers');

jest.setTimeout(10000);

describe('Cluster User Stories', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        const Harness = require('../../../harness').Harness;
        harness = new Harness({ basePort: 21000 });

        // Reset message store
        const messageModule = require('../../../test-api/message');
        messageModule._reset();
    });

    afterEach(async () => {
        await harness.cleanup();
    });

    describe('Multi-Server Setup', () => {
        test('can create a cluster of servers', async () => {
            await canCreateClusterOfServers({ harness, expect });
        });

        test('each server has unique port', async () => {
            await eachServerHasUniquePort({ harness, expect });
        });

        test('clients can connect to different servers', async () => {
            await clientsCanConnectToDifferentServers({ harness, expect });
        });
    });

    describe('Shared FakeDatabase', () => {
        test('each harness has its own FakeDatabase instance', async () => {
            await eachHarnessHasOwnFakeDatabaseInstance({ harness, expect });
        });

        test('clients can connect to servers in cluster', async () => {
            await clientsCanConnectToServersInCluster({ harness, expect });
        });
    });

    describe('Independent Server Operations', () => {
        test('RPC calls work on each server independently', async () => {
            await rpcCallsWorkOnEachServerIndependently({ harness, expect });
        });

        test('broadcast within same server works', async () => {
            await broadcastWithinSameServerWorks({ harness, expect });
        });
    });

    describe('Database Helpers', () => {
        test('getState returns database state', async () => {
            await getStateReturnsDatabaseState({ harness, expect });
        });

        test('reset clears all database state', async () => {
            await resetClearsAllDatabaseState({ harness, expect });
        });
    });

    describe('Server Lifecycle', () => {
        test('can close individual cluster server', async () => {
            await canCloseIndividualClusterServer({ harness, expect });
        });

        test('cleanup closes all cluster servers', async () => {
            await cleanupClosesAllClusterServers({ harness, expect });
        });
    });
});
