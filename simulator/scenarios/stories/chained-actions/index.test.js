/**
 * @fileoverview Chained Actions End-to-End Tests
 *
 * These tests demonstrate how to chain action functions from multiple modules
 * together to create complete end-to-end test scenarios. Each test starts from
 * zero and exercises a full developer use case flow using the action API.
 *
 * Key difference from other stories:
 * - Explicitly uses action modules (connection, rpc, broadcast, files, lifecycle, jss)
 * - Chains multiple actions together in sequence
 * - Each test is a complete flow from setup to teardown
 *
 * Pattern:
 *   1. Import actions from simulator/scenarios/actions/*
 *   2. Use lifecycle actions to create server with hooks
 *   3. Use connection actions to connect/disconnect clients
 *   4. Use rpc actions to make API calls
 *   5. Use broadcast actions to verify message delivery
 *   6. Use files actions for file transfers
 *   7. Use jss actions for complex type verification
 *
 * @module simulator/scenarios/stories/chained-actions
 */

const { Harness } = require('../../../harness');

// Import test functions
const chatRoomWithFileSharing = require('./chat-room-with-file-sharing');
const userAuthenticationFlow = require('./user-authentication-flow');
const complexDataBroadcastFlow = require('./complex-data-broadcast-flow');
const errorRecoveryWorkflow = require('./error-recovery-workflow');
const multiServerFileTransfer = require('./multi-server-file-transfer');
const collaborativeDocumentEditing = require('./collaborative-document-editing');
const edgeCaseStressTests = require('./edge-case-stress-tests');
const fileStreamingWorkflow = require('./file-streaming-workflow');
const concurrentOperationsWorkflow = require('./concurrent-operations-workflow');
// Note: Polling transport requires additional harness work to properly reset api-ape singleton
// const pollingTransportWorkflow = require('./polling-transport-workflow');

jest.setTimeout(15000);

describe('Chained Actions End-to-End Tests', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        const Harness = require('../../../harness').Harness;
        harness = new Harness({ basePort: 23000 });

        // Reset any shared state
        const messageModule = require('../../../test-api/message');
        const uploadModule = require('../../../test-api/files/upload');
        messageModule._reset();
        uploadModule._reset();
    });

    afterEach(async () => {
        await harness.cleanup();
    });

    describe('Chat Room with File Sharing', () => {
        test('complete chat flow with file upload and download', async () => {
            await chatRoomWithFileSharing({ harness, expect });
        });
    });

    describe('User Authentication Flow', () => {
        test('authentication with role-based access and session persistence', async () => {
            await userAuthenticationFlow({ harness, expect });
        });
    });

    describe('Complex Data Broadcast Flow', () => {
        test('JSS types survive round-trip through RPC and broadcast', async () => {
            await complexDataBroadcastFlow({ harness, expect });
        });
    });

    describe('Error Recovery Workflow', () => {
        test('client recovers from sync, async, and missing endpoint errors', async () => {
            await errorRecoveryWorkflow({ harness, expect });
        });
    });

    describe('Multi-Server File Transfer', () => {
        test('files transferred and isolated across multiple servers', async () => {
            await multiServerFileTransfer({ harness, expect });
        });
    });

    describe('Collaborative Document Editing', () => {
        test('complete collaborative editing workflow with all action types', async () => {
            await collaborativeDocumentEditing({ harness, expect });
        });
    });

    describe('Edge Case and Stress Tests', () => {
        test('handles large payloads, deep nesting, and rapid operations', async () => {
            await edgeCaseStressTests({ harness, expect });
        });
    });

    describe('File Streaming Workflow', () => {
        test('handles various file sizes and concurrent transfers', async () => {
            await fileStreamingWorkflow({ harness, expect });
        });
    });

    describe('Concurrent Operations Workflow', () => {
        test('handles concurrent operations from multiple clients', async () => {
            await concurrentOperationsWorkflow({ harness, expect });
        });
    });

    // Polling transport test commented out - requires additional harness work
    // describe('Polling Transport Workflow', () => {
    //     test('handles RPC calls over long polling transport', async () => {
    //         await pollingTransportWorkflow({ harness, expect });
    //     });
    // });
});
