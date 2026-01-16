/**
 * @fileoverview Complete End-to-End Scenarios
 *
 * These tests demonstrate COMPLETE USER JOURNEYS where each test
 * starts from zero and exercises a full developer use case flow.
 *
 * Pattern:
 *   1. Setup server from scratch
 *   2. Connect users
 *   3. Perform actions (RPC, broadcast, file transfer)
 *   4. Verify outcomes
 *   5. Cleanup (disconnect)
 *
 * @module simulator/scenarios/stories/end-to-end
 */

const { Harness } = require('../../../harness');

// Developer: First API Call
const newUserCallsApiAndReceivesResponse = require('./developer-first-api-call/new-user-calls-api-and-receives-response');

// Developer: Real-Time Chat
const twoUsersExchangeMessagesInRealTime = require('./developer-real-time-chat/two-users-exchange-messages-in-real-time');
const lateJoinerMissesPreviousMessages = require('./developer-real-time-chat/late-joiner-misses-previous-messages');

// Developer: File Sharing
const oneUserSharesFileWithAnother = require('./developer-file-sharing/one-user-shares-file-with-another');

// Developer: Nested API Routes
const userCallsApisAtDifferentNestingLevels = require('./developer-nested-api-routes/user-calls-apis-at-different-nesting-levels');

// Developer: Complex Data Types
const complexTypesRoundTripThroughApi = require('./developer-complex-data-types/complex-types-round-trip-through-api');

// Developer: Error Handling
const userSeesFriendlyErrorWhenCallingBadEndpoint = require('./developer-error-handling/user-sees-friendly-error-when-calling-bad-endpoint');
const userSeesControllerThrownErrors = require('./developer-error-handling/user-sees-controller-thrown-errors');

// Developer: High Load Scenarios
const rapidMessageSendingBetweenUsers = require('./developer-high-load-scenarios/rapid-message-sending-between-users');
const chatRoomWithManySimultaneousUsers = require('./developer-high-load-scenarios/chat-room-with-many-simultaneous-users');
const userMakesManyApiCallsSimultaneously = require('./developer-high-load-scenarios/user-makes-many-api-calls-simultaneously');

// Developer: Async Operations
const userWaitsForSlowApiResponse = require('./developer-async-operations/user-waits-for-slow-api-response');
const parallelSlowCallsCompleteIndependently = require('./developer-async-operations/parallel-slow-calls-complete-independently');

// Developer: Error Recovery
const userContinuesAfterApiError = require('./developer-error-recovery/user-continues-after-api-error');
const userHandlesAsyncControllerError = require('./developer-error-recovery/user-handles-async-controller-error');

// Developer: File Sharing Variations
const fileUploadWithBroadcastToOthers = require('./developer-file-sharing-variations/file-upload-with-broadcast-to-others');
const downloadNonExistentFileShowsError = require('./developer-file-sharing-variations/download-non-existent-file-shows-error');
const largeFileSurvivesRoundTrip = require('./developer-file-sharing-variations/large-file-survives-round-trip');

// Developer: Connection Lifecycle
const userCanReconnectAfterDisconnecting = require('./developer-connection-lifecycle/user-can-reconnect-after-disconnecting');
const serverAccuratelyTracksClientCount = require('./developer-connection-lifecycle/server-accurately-tracks-client-count');
const serverPassesUserContextToControllers = require('./developer-connection-lifecycle/server-passes-user-context-to-controllers');

// Developer: Data Type Edge Cases
const emptyAndNullValuesHandledCorrectly = require('./developer-data-type-edge-cases/empty-and-null-values-handled-correctly');
const deeplyNestedDataPreserved = require('./developer-data-type-edge-cases/deeply-nested-data-preserved');
const arraysOfComplexTypesRoundTrip = require('./developer-data-type-edge-cases/arrays-of-complex-types-round-trip');

// Developer: Error Type Variations
const customErrorWithCodePropertyPropagates = require('./developer-error-type-variations/custom-error-with-code-property-propagates');
const validationErrorWithFieldInfoPropagates = require('./developer-error-type-variations/validation-error-with-field-info-propagates');

// Developer: JSS Type Edge Cases
const simpleRegExpPatternSurvivesRoundTrip = require('./developer-jss-type-edge-cases/simple-regexp-pattern-survives-round-trip');
const undefinedValuePreservedInObject = require('./developer-jss-type-edge-cases/undefined-value-preserved-in-object');
const typeErrorSurvivesRoundTrip = require('./developer-jss-type-edge-cases/typeerror-survives-round-trip');
const rangeErrorSurvivesRoundTrip = require('./developer-jss-type-edge-cases/rangeerror-survives-round-trip');
const nestedSetContainingMapsRoundTrip = require('./developer-jss-type-edge-cases/nested-set-containing-maps-round-trip');
const errorWithCustomNameSurvivesRoundTrip = require('./developer-jss-type-edge-cases/error-with-custom-name-survives-round-trip');

// Developer: Binary Data Variations
const singleByteFileUploadsCorrectly = require('./developer-binary-data-variations/single-byte-file-uploads-correctly');

// Developer: Broadcast Edge Cases
const broadcastToEmptyRoomSucceedsSilently = require('./developer-broadcast-edge-cases/broadcast-to-empty-room-succeeds-silently');
const burstOfMessagesAllDelivered = require('./developer-broadcast-edge-cases/burst-of-messages-all-delivered');

// Developer: Connection Edge Cases
const rapidConnectDisconnectCycle = require('./developer-connection-edge-cases/rapid-connect-disconnect-cycle');
const messageToRecentlyDisconnectedClientFailsGracefully = require('./developer-connection-edge-cases/message-to-recently-disconnected-client-fails-gracefully');

// Developer: Multiple Server Instances
const clientCanConnectToMultipleServers = require('./developer-multiple-server-instances/client-can-connect-to-multiple-servers');

// Developer: Controller Return Values
const controllerThatReturnsNothingWorks = require('./developer-controller-return-values/controller-that-returns-nothing-works');
const deeplyNestedResponsePreserved = require('./developer-controller-return-values/deeply-nested-response-preserved');

// Developer: Request Patterns
const repeatedRequestsWithDifferentDataWork = require('./developer-request-patterns/repeated-requests-with-different-data-work');
const falsyValuesHandledCorrectly = require('./developer-request-patterns/falsy-values-handled-correctly');
const largePayloadTransmittedCorrectly = require('./developer-request-patterns/large-payload-transmitted-correctly');

jest.setTimeout(10000);

describe('End-to-End User Journeys', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        const Harness = require('../../../harness').Harness;
        harness = new Harness({ basePort: 22000 });

        // Reset any shared state
        const messageModule = require('../../../test-api/message');
        const uploadModule = require('../../../test-api/files/upload');
        messageModule._reset();
        uploadModule._reset();
    });

    afterEach(async () => {
        await harness.cleanup();
    });

    describe('Developer: First API Call', () => {
        test('new user calls API and receives response', async () => {
            await newUserCallsApiAndReceivesResponse({ harness, expect });
        });
    });

    describe('Developer: Real-Time Chat', () => {
        test('two users exchange messages in real-time', async () => {
            await twoUsersExchangeMessagesInRealTime({ harness, expect });
        });

        test('late joiner misses previous messages', async () => {
            await lateJoinerMissesPreviousMessages({ harness, expect });
        });
    });

    describe('Developer: File Sharing', () => {
        test('one user shares file with another', async () => {
            await oneUserSharesFileWithAnother({ harness, expect });
        });
    });

    describe('Developer: Nested API Routes', () => {
        test('user calls APIs at different nesting levels', async () => {
            await userCallsApisAtDifferentNestingLevels({ harness, expect });
        });
    });

    describe('Developer: Complex Data Types', () => {
        test('complex types round-trip through API', async () => {
            await complexTypesRoundTripThroughApi({ harness, expect });
        });
    });

    describe('Developer: Error Handling', () => {
        test('user sees friendly error when calling bad endpoint', async () => {
            await userSeesFriendlyErrorWhenCallingBadEndpoint({ harness, expect });
        });

        test('user sees controller-thrown errors', async () => {
            await userSeesControllerThrownErrors({ harness, expect });
        });
    });

    describe('Developer: High Load Scenarios', () => {
        test('rapid message sending between users', async () => {
            await rapidMessageSendingBetweenUsers({ harness, expect });
        });

        test('chat room with many simultaneous users', async () => {
            await chatRoomWithManySimultaneousUsers({ harness, expect });
        });

        test('user makes many API calls simultaneously', async () => {
            await userMakesManyApiCallsSimultaneously({ harness, expect });
        });
    });

    describe('Developer: Async Operations', () => {
        test('user waits for slow API response', async () => {
            await userWaitsForSlowApiResponse({ harness, expect });
        });

        test('parallel slow calls complete independently', async () => {
            await parallelSlowCallsCompleteIndependently({ harness, expect });
        });
    });

    describe('Developer: Error Recovery', () => {
        test('user continues after API error', async () => {
            await userContinuesAfterApiError({ harness, expect });
        });

        test('user handles async controller error', async () => {
            await userHandlesAsyncControllerError({ harness, expect });
        });
    });

    describe('Developer: File Sharing Variations', () => {
        test('file upload with broadcast to others', async () => {
            await fileUploadWithBroadcastToOthers({ harness, expect });
        });

        test('download non-existent file shows error', async () => {
            await downloadNonExistentFileShowsError({ harness, expect });
        });

        test('large file survives round-trip', async () => {
            await largeFileSurvivesRoundTrip({ harness, expect });
        });
    });

    describe('Developer: Connection Lifecycle', () => {
        test('user can reconnect after disconnecting', async () => {
            await userCanReconnectAfterDisconnecting({ harness, expect });
        });

        test('server accurately tracks client count', async () => {
            await serverAccuratelyTracksClientCount({ harness, expect });
        });

        test('server passes user context to controllers', async () => {
            await serverPassesUserContextToControllers({ harness, expect });
        });
    });

    describe('Developer: Data Type Edge Cases', () => {
        test('empty and null values handled correctly', async () => {
            await emptyAndNullValuesHandledCorrectly({ harness, expect });
        });

        test('deeply nested data preserved', async () => {
            await deeplyNestedDataPreserved({ harness, expect });
        });

        test('arrays of complex types round-trip', async () => {
            await arraysOfComplexTypesRoundTrip({ harness, expect });
        });
    });

    describe('Developer: Error Type Variations', () => {
        test('custom error with code property propagates', async () => {
            await customErrorWithCodePropertyPropagates({ harness, expect });
        });

        test('validation error with field info propagates', async () => {
            await validationErrorWithFieldInfoPropagates({ harness, expect });
        });
    });

    describe('Developer: JSS Type Edge Cases', () => {
        test('simple RegExp pattern survives round-trip', async () => {
            await simpleRegExpPatternSurvivesRoundTrip({ harness, expect });
        });

        test('undefined value preserved in object', async () => {
            await undefinedValuePreservedInObject({ harness, expect });
        });

        test('TypeError survives round-trip', async () => {
            await typeErrorSurvivesRoundTrip({ harness, expect });
        });

        test('RangeError survives round-trip', async () => {
            await rangeErrorSurvivesRoundTrip({ harness, expect });
        });

        test('nested Set containing Maps round-trip', async () => {
            await nestedSetContainingMapsRoundTrip({ harness, expect });
        });

        test('Error with custom name survives round-trip', async () => {
            await errorWithCustomNameSurvivesRoundTrip({ harness, expect });
        });
    });

    describe('Developer: Binary Data Variations', () => {
        test('single byte file uploads correctly', async () => {
            await singleByteFileUploadsCorrectly({ harness, expect });
        });
    });

    describe('Developer: Broadcast Edge Cases', () => {
        test('broadcast to empty room succeeds silently', async () => {
            await broadcastToEmptyRoomSucceedsSilently({ harness, expect });
        });

        test('burst of messages all delivered', async () => {
            await burstOfMessagesAllDelivered({ harness, expect });
        });
    });

    describe('Developer: Connection Edge Cases', () => {
        test('rapid connect-disconnect cycle', async () => {
            await rapidConnectDisconnectCycle({ harness, expect });
        });

        test('message to recently disconnected client fails gracefully', async () => {
            await messageToRecentlyDisconnectedClientFailsGracefully({ harness, expect });
        });
    });

    describe('Developer: Multiple Server Instances', () => {
        test('client can connect to multiple servers', async () => {
            await clientCanConnectToMultipleServers({ harness, expect });
        });
    });

    describe('Developer: Controller Return Values', () => {
        test('controller that returns nothing works', async () => {
            await controllerThatReturnsNothingWorks({ harness, expect });
        });

        test('deeply nested response preserved', async () => {
            await deeplyNestedResponsePreserved({ harness, expect });
        });
    });

    describe('Developer: Request Patterns', () => {
        test('repeated requests with different data work', async () => {
            await repeatedRequestsWithDifferentDataWork({ harness, expect });
        });

        test('falsy values handled correctly', async () => {
            await falsyValuesHandledCorrectly({ harness, expect });
        });

        test('large payload transmitted correctly', async () => {
            await largePayloadTransmittedCorrectly({ harness, expect });
        });
    });
});
