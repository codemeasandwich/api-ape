/**
 * @fileoverview Lifecycle User Stories - Connection lifecycle testing
 *
 * Tests lifecycle functionality through api-ape's public interface:
 * - onConnect callback with embed
 * - Context access in controllers (this.*)
 * - onDisconnect handling
 * - Connection state tracking
 *
 * @module simulator/scenarios/stories/lifecycle
 */

const { Harness } = require('../../../harness');

// onConnect with Embed (L1) tests
const embeddedValuesAvailableInControllerContext = require('./on-connect-with-embed/embedded-values-available-in-controller-context');
const eachClientCanHaveDifferentEmbedValues = require('./on-connect-with-embed/each-client-can-have-different-embed-values');

// Controller Context (X1-X6) tests
const clientIdIsUniquePerConnection = require('./controller-context/client-id-is-unique-per-connection');
const clientIdAccessibleInUsersController = require('./controller-context/client-id-accessible-in-users-controller');

// onConnect Welcome Message tests
const serverCanSendWelcomeMessageOnConnect = require('./on-connect-welcome-message/server-can-send-welcome-message-on-connect');
const multipleWelcomeMessagesCanBeSent = require('./on-connect-welcome-message/multiple-welcome-messages-can-be-sent');

// Connection States tests
const clientStartsConnectedAfterCreatePair = require('./connection-states/client-starts-connected-after-create-pair');
const clientBecomesDisconnectedAfterDisconnect = require('./connection-states/client-becomes-disconnected-after-disconnect');
const disconnectedEventFiresOnDisconnect = require('./connection-states/disconnected-event-fires-on-disconnect');

// Server Client Tracking tests
const serverTracksConnectedClientCount = require('./server-client-tracking/server-tracks-connected-client-count');

// onDisconnect Callback tests
const onDisconnectFiresWhenClientDisconnects = require('./on-disconnect-callback/on-disconnect-fires-when-client-disconnects');
const onDisconnectCalledForEachDisconnectingClient = require('./on-disconnect-callback/on-disconnect-called-for-each-disconnecting-client');

jest.setTimeout(5000);

describe('Lifecycle User Stories', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        harness = new Harness({ basePort: 12000 });
    });

    afterEach(async () => {
        await harness.cleanup();
    });

    describe('onConnect with Embed (L1)', () => {
        test('embedded values available in controller context', async () => {
            await embeddedValuesAvailableInControllerContext({ harness, expect });
        });

        test('each client can have different embed values', async () => {
            await eachClientCanHaveDifferentEmbedValues({ harness, expect });
        });
    });

    describe('Controller Context (X1-X6)', () => {
        test('this.clientId is unique per connection', async () => {
            await clientIdIsUniquePerConnection({ harness, expect });
        });

        test('this.clientId accessible in users controller', async () => {
            await clientIdAccessibleInUsersController({ harness, expect });
        });
    });

    describe('onConnect Welcome Message', () => {
        test('server can send welcome message on connect', async () => {
            await serverCanSendWelcomeMessageOnConnect({ harness, expect });
        });

        test('multiple welcome messages can be sent', async () => {
            await multipleWelcomeMessagesCanBeSent({ harness, expect });
        });
    });

    describe('Connection States', () => {
        test('client starts connected after createPair', async () => {
            await clientStartsConnectedAfterCreatePair({ harness, expect });
        });

        test('client becomes disconnected after disconnect', async () => {
            await clientBecomesDisconnectedAfterDisconnect({ harness, expect });
        });

        test('disconnected event fires on disconnect', async () => {
            await disconnectedEventFiresOnDisconnect({ harness, expect });
        });
    });

    describe('Server Client Tracking', () => {
        test('server tracks connected client count', async () => {
            await serverTracksConnectedClientCount({ harness, expect });
        });
    });

    describe('onDisconnect Callback', () => {
        test('onDisconnect fires when client disconnects', async () => {
            await onDisconnectFiresWhenClientDisconnects({ harness, expect });
        });

        test('onDisconnect called for each disconnecting client', async () => {
            await onDisconnectCalledForEachDisconnectingClient({ harness, expect });
        });
    });
});
