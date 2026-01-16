/**
 * @fileoverview Chat Application User Story - Complete user journey test
 *
 * This is a comprehensive end-to-end test that simulates a real chat
 * application user journey, combining multiple api-ape features:
 * - Connection with embedded user identity
 * - Real-time messaging with broadcasts
 * - Multiple users joining and leaving
 *
 * @module simulator/scenarios/stories/chat-app
 */

const { Harness } = require('../../../harness');

// Import test functions
const fullChatSessionWithMultipleUsers = require('./complete-user-journey/full-chat-session-with-multiple-users');
const rapidMessageExchangeBetweenTwoUsers = require('./complete-user-journey/rapid-message-exchange-between-two-users');
const manyUsersInAChatRoom = require('./complete-user-journey/many-users-in-a-chat-room');

jest.setTimeout(10000);

describe('Chat Application User Story', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        const Harness = require('../../../harness').Harness;
        harness = new Harness({ basePort: 13000 });

        // Reset message store
        const messageModule = require('../../../test-api/message');
        messageModule._reset();
    });

    afterEach(async () => {
        await harness.cleanup();
    });

    describe('Complete User Journey', () => {
        test('full chat session with multiple users', async () => {
            await fullChatSessionWithMultipleUsers({ harness, expect });
        });

        test('rapid message exchange between two users', async () => {
            await rapidMessageExchangeBetweenTwoUsers({ harness, expect });
        });

        test('many users in a chat room', async () => {
            await manyUsersInAChatRoom({ harness, expect });
        });
    });
});
