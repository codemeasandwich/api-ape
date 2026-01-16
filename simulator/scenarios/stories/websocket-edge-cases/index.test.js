/**
 * @fileoverview WebSocket Edge Cases User Stories
 *
 * Tests WebSocket-specific edge cases through api-ape's interface:
 * - Ping/Pong keepalive frames
 * - Large message fragmentation
 * - Connection close handshake with codes
 * - Rapid reconnection cycles
 * - Binary data transfer
 *
 * @module simulator/scenarios/stories/websocket-edge-cases
 */

const { Harness } = require('../../../harness');

// Ping/Pong Keepalive tests
const pingPongKeepalive = require('./ping-pong-keepalive');
const multiplePingPongCycles = require('./multiple-ping-pong-cycles');

// Large Message Fragmentation tests
const largeMessageFragmentation = require('./large-message-fragmentation');
const veryLargeMessageSurvivesRoundtrip = require('./very-large-message-survives-roundtrip');

// Connection Close Handshake tests
const connectionCloseWithCode = require('./connection-close-with-code');
const connectionCloseGoingAway = require('./connection-close-going-away');

// Rapid Reconnection tests
const rapidReconnectionCycles = require('./rapid-reconnection-cycles');
const concurrentReconnectionMultipleClients = require('./concurrent-reconnection-multiple-clients');

// Binary Data Transfer tests
const binaryDataBufferTransfer = require('./binary-data-buffer-transfer');
const binaryDataLargeBuffer = require('./binary-data-large-buffer');

jest.setTimeout(15000);

describe('WebSocket Edge Cases User Stories', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        harness = new Harness({ basePort: 20000 });
    });

    afterEach(async () => {
        await harness.cleanup();
    });

    describe('Ping/Pong Keepalive', () => {
        test('ping frame receives pong response', async () => {
            await pingPongKeepalive({ harness, expect });
        });

        test('multiple ping/pong cycles work correctly', async () => {
            await multiplePingPongCycles({ harness, expect });
        });
    });

    describe('Large Message Fragmentation', () => {
        test('100KB message survives fragmentation', async () => {
            await largeMessageFragmentation({ harness, expect });
        });

        test('500KB message survives roundtrip', async () => {
            await veryLargeMessageSurvivesRoundtrip({ harness, expect });
        });
    });

    describe('Connection Close Handshake', () => {
        test('normal close with code 1000', async () => {
            await connectionCloseWithCode({ harness, expect });
        });

        test('going away close with code 1001', async () => {
            await connectionCloseGoingAway({ harness, expect });
        });
    });

    describe('Rapid Reconnection', () => {
        test('sequential disconnect/reconnect cycles succeed', async () => {
            await rapidReconnectionCycles({ harness, expect });
        });

        test('concurrent reconnection from multiple clients', async () => {
            await concurrentReconnectionMultipleClients({ harness, expect });
        });
    });

    describe('Binary Data Transfer', () => {
        test('256 byte buffer with all byte values', async () => {
            await binaryDataBufferTransfer({ harness, expect });
        });

        test('64KB binary buffer transfer', async () => {
            await binaryDataLargeBuffer({ harness, expect });
        });
    });
});
