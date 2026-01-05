/**
 * Unit tests for server/lib/fileTransfer.js
 * Tests FileTransferManager including streaming file methods for client-to-client transfers
 */

const { FileTransferManager, getFileTransferManager } = require('./fileTransfer');

// Reset singleton between tests
let instance = null;
beforeEach(() => {
    instance = null;
    // Access private module variable through require.cache
    const modulePath = require.resolve('./fileTransfer');
    delete require.cache[modulePath];
});

// =============================================================================
// STREAMING FILE TESTS
// =============================================================================

describe('FileTransferManager - Streaming Files', () => {
    let manager;

    beforeEach(() => {
        manager = new FileTransferManager({
            startTimeout: 1000,   // Short timeouts for tests
            completeTimeout: 1000
        });
    });

    afterEach(() => {
        manager.destroy();
    });

    describe('registerStreamingFile', () => {
        test('registers a new streaming file', () => {
            const fileId = manager.registerStreamingFile('file-123', 'client-abc');
            expect(fileId).toBe('file-123');
            expect(manager.isStreamingFile('file-123')).toBe(true);
        });

        test('returns the fileId', () => {
            const result = manager.registerStreamingFile('test-file', 'uploader-1');
            expect(result).toBe('test-file');
        });

        test('replaces existing entry with same fileId', () => {
            manager.registerStreamingFile('file-1', 'client-a');
            manager.registerStreamingFile('file-1', 'client-b');

            // Should still be registered (replaced, not duplicated)
            expect(manager.isStreamingFile('file-1')).toBe(true);
        });

        test('multiple files can be registered', () => {
            manager.registerStreamingFile('file-1', 'client-a');
            manager.registerStreamingFile('file-2', 'client-a');
            manager.registerStreamingFile('file-3', 'client-b');

            expect(manager.isStreamingFile('file-1')).toBe(true);
            expect(manager.isStreamingFile('file-2')).toBe(true);
            expect(manager.isStreamingFile('file-3')).toBe(true);
        });
    });

    describe('isStreamingFile', () => {
        test('returns false for non-existent file', () => {
            expect(manager.isStreamingFile('nonexistent')).toBe(false);
        });

        test('returns true for registered file', () => {
            manager.registerStreamingFile('exists', 'client-1');
            expect(manager.isStreamingFile('exists')).toBe(true);
        });
    });

    describe('getStreamingFile', () => {
        test('returns null for non-existent file', () => {
            const result = manager.getStreamingFile('nonexistent');
            expect(result).toBeNull();
        });

        test('returns empty buffer for newly registered file', () => {
            manager.registerStreamingFile('empty-file', 'client-1');
            const result = manager.getStreamingFile('empty-file');

            expect(result).not.toBeNull();
            expect(result.data).toBeInstanceOf(Buffer);
            expect(result.data.length).toBe(0);
            expect(result.isComplete).toBe(false);
            expect(result.totalReceived).toBe(0);
        });

        test('returns data after appendChunk', () => {
            manager.registerStreamingFile('chunked', 'client-1');
            manager.appendChunk('chunked', Buffer.from('hello'));

            const result = manager.getStreamingFile('chunked');
            expect(result.data.toString()).toBe('hello');
            expect(result.totalReceived).toBe(5);
            expect(result.isComplete).toBe(false);
        });

        test('supports offset parameter', () => {
            manager.registerStreamingFile('partial', 'client-1');
            manager.appendChunk('partial', Buffer.from('hello world'));

            const result = manager.getStreamingFile('partial', 6);
            expect(result.data.toString()).toBe('world');
        });
    });

    describe('appendChunk', () => {
        test('returns false for non-existent file', () => {
            const success = manager.appendChunk('nonexistent', Buffer.from('data'));
            expect(success).toBe(false);
        });

        test('returns true for valid file', () => {
            manager.registerStreamingFile('valid', 'client-1');
            const success = manager.appendChunk('valid', Buffer.from('data'));
            expect(success).toBe(true);
        });

        test('accumulates multiple chunks', () => {
            manager.registerStreamingFile('multi', 'client-1');
            manager.appendChunk('multi', Buffer.from('chunk1-'));
            manager.appendChunk('multi', Buffer.from('chunk2-'));
            manager.appendChunk('multi', Buffer.from('chunk3'));

            const result = manager.getStreamingFile('multi');
            expect(result.data.toString()).toBe('chunk1-chunk2-chunk3');
            expect(result.totalReceived).toBe(20);
        });

        test('handles binary data', () => {
            manager.registerStreamingFile('binary', 'client-1');
            const binaryData = Buffer.from([0x00, 0x01, 0xFF, 0xFE]);
            manager.appendChunk('binary', binaryData);

            const result = manager.getStreamingFile('binary');
            expect(Buffer.compare(result.data, binaryData)).toBe(0);
        });
    });

    describe('completeStreamingUpload', () => {
        test('returns false for non-existent file', () => {
            const success = manager.completeStreamingUpload('nonexistent', Buffer.from('data'));
            expect(success).toBe(false);
        });

        test('marks file as complete', () => {
            manager.registerStreamingFile('completing', 'client-1');
            manager.appendChunk('completing', Buffer.from('partial'));
            const success = manager.completeStreamingUpload('completing');

            expect(success).toBe(true);
            const result = manager.getStreamingFile('completing');
            expect(result.isComplete).toBe(true);
        });

        test('replaces chunks with complete data if provided', () => {
            manager.registerStreamingFile('replace', 'client-1');
            manager.appendChunk('replace', Buffer.from('partial data'));

            const completeData = Buffer.from('final complete data');
            manager.completeStreamingUpload('replace', completeData);

            const result = manager.getStreamingFile('replace');
            expect(result.data.toString()).toBe('final complete data');
            expect(result.totalReceived).toBe(19);
            expect(result.isComplete).toBe(true);
        });

        test('preserves existing chunks if no data provided', () => {
            manager.registerStreamingFile('preserve', 'client-1');
            manager.appendChunk('preserve', Buffer.from('keep this'));
            manager.completeStreamingUpload('preserve');

            const result = manager.getStreamingFile('preserve');
            expect(result.data.toString()).toBe('keep this');
        });
    });

    describe('timeout and cleanup', () => {
        test('file expires after timeout', async () => {
            const shortManager = new FileTransferManager({
                startTimeout: 50,
                completeTimeout: 50
            });

            shortManager.registerStreamingFile('expiring', 'client-1');
            expect(shortManager.isStreamingFile('expiring')).toBe(true);

            // Wait for expiration
            await new Promise(r => setTimeout(r, 150));

            expect(shortManager.isStreamingFile('expiring')).toBe(false);
            shortManager.destroy();
        });

        test('destroy clears all streaming files', () => {
            manager.registerStreamingFile('file-1', 'client-1');
            manager.registerStreamingFile('file-2', 'client-2');

            manager.destroy();

            expect(manager.isStreamingFile('file-1')).toBe(false);
            expect(manager.isStreamingFile('file-2')).toBe(false);
        });
    });
});

// =============================================================================
// EXISTING DOWNLOAD/UPLOAD TESTS
// =============================================================================

describe('FileTransferManager - Downloads', () => {
    let manager;

    beforeEach(() => {
        manager = new FileTransferManager({
            startTimeout: 1000,
            completeTimeout: 1000
        });
    });

    afterEach(() => {
        manager.destroy();
    });

    describe('registerDownload', () => {
        test('registers a download', () => {
            const hash = manager.registerDownload('hash-1', Buffer.from('data'), 'text/plain', 'client-1');
            expect(hash).toBe('hash-1');
        });

        test('returns null for session mismatch', () => {
            manager.registerDownload('hash-1', Buffer.from('data'), 'text/plain', 'client-1');
            const result = manager.getDownload('hash-1', 'wrong-client');
            expect(result).toBeNull();
        });

        test('returns data for correct session', () => {
            manager.registerDownload('hash-1', Buffer.from('hello'), 'text/plain', 'client-1');
            const result = manager.getDownload('hash-1', 'client-1');
            expect(result).not.toBeNull();
            expect(result.data.toString()).toBe('hello');
            expect(result.contentType).toBe('text/plain');
        });
    });

    describe('generateHash', () => {
        test('generates consistent hash for same inputs', () => {
            const hash1 = FileTransferManager.generateHash('query-1', 'path.to.data');
            const hash2 = FileTransferManager.generateHash('query-1', 'path.to.data');
            expect(hash1).toBe(hash2);
        });

        test('generates different hash for different inputs', () => {
            const hash1 = FileTransferManager.generateHash('query-1', 'path.a');
            const hash2 = FileTransferManager.generateHash('query-1', 'path.b');
            expect(hash1).not.toBe(hash2);
        });

        test('returns alphanumeric hash', () => {
            const hash = FileTransferManager.generateHash('test', 'data');
            expect(/^[a-z0-9]+$/.test(hash)).toBe(true);
        });
    });
});

describe('FileTransferManager - Uploads', () => {
    let manager;

    beforeEach(() => {
        manager = new FileTransferManager({
            startTimeout: 500,
            completeTimeout: 500
        });
    });

    afterEach(() => {
        manager.destroy();
    });

    describe('registerUpload', () => {
        test('returns promise that resolves when data received', async () => {
            const uploadPromise = manager.registerUpload('query-1', 'hash-1', 'client-1');

            // Simulate upload completion
            setTimeout(() => {
                manager.receiveUpload('query-1', 'hash-1', Buffer.from('uploaded'), 'client-1');
            }, 50);

            const data = await uploadPromise;
            expect(data.toString()).toBe('uploaded');
        });

        test('rejects on session mismatch', async () => {
            const uploadPromise = manager.registerUpload('query-1', 'hash-1', 'client-1');

            setTimeout(() => {
                manager.receiveUpload('query-1', 'hash-1', Buffer.from('data'), 'wrong-client');
            }, 50);

            await expect(uploadPromise).rejects.toThrow('Upload timeout');
        });

        test('rejects on timeout', async () => {
            const uploadPromise = manager.registerUpload('query-1', 'hash-1', 'client-1');

            // Don't call receiveUpload
            await expect(uploadPromise).rejects.toThrow('Upload timeout');
        });
    });

    describe('receiveUpload', () => {
        test('returns false for unexpected upload', () => {
            const success = manager.receiveUpload('unknown', 'unknown', Buffer.from('data'), 'client');
            expect(success).toBe(false);
        });

        test('returns true for expected upload', async () => {
            const uploadPromise = manager.registerUpload('query-1', 'hash-1', 'client-1');

            const successPromise = new Promise(resolve => {
                setTimeout(() => {
                    const success = manager.receiveUpload('query-1', 'hash-1', Buffer.from('data'), 'client-1');
                    resolve(success);
                }, 10);
            });

            const [data, success] = await Promise.all([uploadPromise, successPromise]);
            expect(success).toBe(true);
            expect(data.toString()).toBe('data');
        });
    });
});

// =============================================================================
// SINGLETON PATTERN TESTS
// =============================================================================

describe('getFileTransferManager', () => {
    test('returns same instance on multiple calls', () => {
        const { getFileTransferManager: getFTM } = require('./fileTransfer');
        const instance1 = getFTM();
        const instance2 = getFTM();
        expect(instance1).toBe(instance2);
    });
});
