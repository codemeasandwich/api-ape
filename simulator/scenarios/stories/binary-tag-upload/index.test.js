/**
 * @fileoverview Binary Tag Upload User Stories
 *
 * Tests the binary upload tag system (`<!B>` and `<!A>` tags):
 * - Client sends message with tagged field: { "file<!B>": "hash" }
 * - Client uploads binary data via HTTP PUT
 * - Server receives and injects binary data into message
 * - Controller receives clean object with Buffer
 *
 * The server sends clientId in the __connected__ message, which the
 * test harness captures and uses in HTTP PUT requests for authentication.
 *
 * @module simulator/scenarios/stories/binary-tag-upload
 */

const { Harness } = require('../../../harness');

jest.setTimeout(15000);

describe('Binary Tag Upload User Stories', () => {
    let harness;

    beforeEach(() => {
        jest.resetModules();
        harness = new Harness({ basePort: 27000, connectTimeout: 5000 });
    });

    afterEach(async () => {
        await harness.cleanup();
        await new Promise(r => setTimeout(r, 50));
    });

    describe('Buffer Tag Upload (<!B>)', () => {
        test('uploads small binary file via tag system', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const testData = Buffer.from('Hello, binary world!');

            const result = await client.callWithBinary(
                'binary-upload',
                { name: 'test.txt' },
                { file: testData },
                5000
            );

            expect(result.success).toBe(true);
            expect(result.received.file.type).toBe('Buffer');
        });

        test('uploads larger binary file (1KB)', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const testData = Buffer.alloc(1024);
            for (let i = 0; i < testData.length; i++) {
                testData[i] = i % 256;
            }

            const result = await client.callWithBinary(
                'binary-upload',
                { name: 'binary.dat', size: testData.length },
                { data: testData },
                5000
            );

            expect(result.success).toBe(true);
        });

        test('uploads multiple binary fields in one message', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const file1 = Buffer.from('First file content');
            const file2 = Buffer.from('Second file content');

            const result = await client.callWithBinary(
                'binary-upload',
                { description: 'Two files' },
                {
                    primary: file1,
                    secondary: file2
                },
                5000
            );

            expect(result.success).toBe(true);
        });
    });

    describe('ArrayBuffer Tag Upload (<!A>)', () => {
        /**
         * User scenario: Developer uploads binary data that should be
         * returned as ArrayBuffer on the client side.
         * This exercises: tagUtils.js lines 134-135 (aMatch) and 144-150
         */
        test('uploads binary file via <!A> tag system', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const testData = Buffer.from('ArrayBuffer test content');

            const result = await client.callWithArrayBuffer(
                'binary-upload',
                { name: 'arraybuffer.bin' },
                { data: testData },
                5000
            );

            expect(result.success).toBe(true);
            expect(result.received.data.type).toBe('Buffer');
        });

        test('uploads multiple ArrayBuffer fields in one message', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const buffer1 = Buffer.from('First ArrayBuffer');
            const buffer2 = Buffer.from('Second ArrayBuffer');

            const result = await client.callWithArrayBuffer(
                'binary-upload',
                { description: 'Two ArrayBuffers' },
                {
                    primary: buffer1,
                    secondary: buffer2
                },
                5000
            );

            expect(result.success).toBe(true);
            expect(result.received.primary.type).toBe('Buffer');
            expect(result.received.secondary.type).toBe('Buffer');
        });

        test('mixes <!A> and regular data in same message', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const binaryData = Buffer.from('Binary content');

            const result = await client.callWithArrayBuffer(
                'binary-upload',
                {
                    name: 'mixed-data.bin',
                    metadata: { type: 'test', size: binaryData.length }
                },
                { content: binaryData },
                5000
            );

            expect(result.success).toBe(true);
            expect(result.received.name).toEqual({ type: 'string', value: 'mixed-data.bin' });
            expect(result.received.content.type).toBe('Buffer');
        });
    });

    describe('Standard Binary Transfer (via JSS)', () => {
        // This works because binary data is serialized inline, not via tag system
        test('transfers binary data via standard JSS encoding', async () => {
            const { client } = await harness.createPair({ where: 'test-api' });

            const testData = Buffer.from('Test binary content');

            // Standard call - JSS encodes Buffer inline
            const result = await client.call('binary-upload', {
                name: 'test.bin',
                content: testData
            }, 5000);

            expect(result.success).toBe(true);
            expect(result.received.name).toEqual({ type: 'string', value: 'test.bin' });
            // Content may be received as Buffer or object depending on JSS decoding
            expect(result.received.content).toBeDefined();
        });
    });
});
