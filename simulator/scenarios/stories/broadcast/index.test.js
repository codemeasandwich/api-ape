/**
 * @fileoverview Broadcast User Stories - Complete broadcast testing scenarios
 *
 * Tests all broadcast functionality through api-ape's public interface:
 * - Broadcast to all clients
 * - Broadcast to others (excluding sender)
 * - Server-side broadcasts
 * - Multiple client scenarios
 *
 * @module simulator/scenarios/stories/broadcast
 */

const { Harness } = require('../../../harness');

// Broadcast to Others (B2)
const senderDoesNotReceiveOwnBroadcast = require('./broadcast-to-others/sender-does-not-receive-own-broadcast');
const multipleSendersExcludedFromOwnMessages = require('./broadcast-to-others/multiple-senders-excluded-from-own-messages');

// waitFor Buffering
const waitForReturnsExistingBufferedMessage = require('./wait-for-buffering/wait-for-returns-existing-buffered-message');
const waitForWaitsForFutureMessage = require('./wait-for-buffering/wait-for-waits-for-future-message');
const waitForTimesOutWhenNoMessage = require('./wait-for-buffering/wait-for-times-out-when-no-message');

// Multiple Clients Scaling
const broadcastReachesAllClients = require('./multiple-clients-scaling/broadcast-reaches-all-clients');
const rapidSequentialMessagesAllDelivered = require('./multiple-clients-scaling/rapid-sequential-messages-all-delivered');

// Late Joiner
const lateJoinerDoesNotReceiveOldBroadcasts = require('./late-joiner/late-joiner-does-not-receive-old-broadcasts');

jest.setTimeout(5000);

describe('Broadcast User Stories', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        const HarnessModule = require('../../../harness');
        harness = new HarnessModule.Harness({ basePort: 11000 });

        // Reset message store
        const messageModule = require('../../../test-api/message');
        messageModule._reset();
    });

    afterEach(async () => {
        await harness.cleanup();
    });

    describe('Broadcast to Others (B2)', () => {
        test('sender does not receive their own broadcast', async () => {
            await senderDoesNotReceiveOwnBroadcast({ harness, expect });
        });

        test('multiple senders each excluded from their own messages', async () => {
            await multipleSendersExcludedFromOwnMessages({ harness, expect });
        });
    });

    describe('waitFor Buffering', () => {
        test('waitFor returns existing buffered message', async () => {
            await waitForReturnsExistingBufferedMessage({ harness, expect });
        });

        test('waitFor waits for future message', async () => {
            await waitForWaitsForFutureMessage({ harness, expect });
        });

        test('waitFor times out when no message arrives', async () => {
            await waitForTimesOutWhenNoMessage({ harness, expect });
        });
    });

    describe('Multiple Clients Scaling', () => {
        test('broadcast reaches all 10 clients', async () => {
            await broadcastReachesAllClients({ harness, expect });
        });

        test('rapid sequential messages all delivered', async () => {
            await rapidSequentialMessagesAllDelivered({ harness, expect });
        });
    });

    describe('Late Joiner', () => {
        test('late joiner does not receive old broadcasts', async () => {
            await lateJoinerDoesNotReceiveOldBroadcasts({ harness, expect });
        });
    });
});
