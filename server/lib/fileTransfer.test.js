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

        // Scenario: registerDownload called twice with the same hash — the
        // existing entry's timer must be cleared before the new entry replaces
        // it. Without this, the old setTimeout would fire later and delete
        // the freshly-registered entry.
        test('re-registering same hash clears the existing timer', () => {
            manager.registerDownload('hash-dup', Buffer.from('v1'), 'text/plain', 'client-1');
            manager.registerDownload('hash-dup', Buffer.from('v2'), 'text/plain', 'client-1');
            const result = manager.getDownload('hash-dup', 'client-1');
            expect(result.data.toString()).toBe('v2');
        });

        // Scenario: registerDownload called WITHOUT a contentType — the entry
        // must default to the binary fallback `application/octet-stream`.
        test('defaults contentType to application/octet-stream when omitted', () => {
            manager.registerDownload('hash-noct', Buffer.from('data'), undefined, 'client-1');
            const result = manager.getDownload('hash-noct', 'client-1');
            expect(result.contentType).toBe('application/octet-stream');
        });

        // Scenario: the start-timeout fires before the download is consumed —
        // the entry must auto-delete. Exercises the setTimeout callback at
        // L407-412 (`if (!entry.downloadStarted) delete`).
        test('start-timeout deletes entry when download never starts', async () => {
            const m = new FileTransferManager({ startTimeout: 30, completeTimeout: 30 });
            try {
                m.registerDownload('hash-expire', Buffer.from('x'), 'text/plain', 'client-1');
                await new Promise((r) => setTimeout(r, 60));
                expect(m.getDownload('hash-expire', 'client-1')).toBeNull();
            } finally {
                m.destroy();
            }
        });

        // Scenario: the consumer fetched the download first (downloadStarted
        // becomes true), and only after that does the start-timeout fire. The
        // setTimeout body must NOT delete the entry — exercises the falsy
        // branch of `if (!entry?.downloadStarted)` at L409.
        test('start-timeout no-ops when download already started', async () => {
            const m = new FileTransferManager({ startTimeout: 50, completeTimeout: 5000 });
            try {
                m.registerDownload('hash-fast', Buffer.from('x'), 'text/plain', 'client-1');
                // Consume the download immediately — downloadStarted = true,
                // first timer cleared and replaced with completeTimeout (5s).
                const got = m.getDownload('hash-fast', 'client-1');
                expect(got).not.toBeNull();
                // Wait until the original startTimeout would have fired (50ms).
                // Even if a stale timer reference fires, the entry must remain
                // because downloadStarted=true.
                await new Promise((r) => setTimeout(r, 80));
                // Entry should still exist (until completeTimeout fires).
                expect(m.pendingDownloads.has('hash-fast')).toBe(true);
            } finally {
                m.destroy();
            }
        });

        // Scenario: the download was fetched (started) but the consumer did
        // not finish consuming within completeTimeout. The entry must be
        // garbage-collected. Exercises the second setTimeout body at L463.
        test('completeTimeout deletes entry after started but not completed', async () => {
            const m = new FileTransferManager({ startTimeout: 1000, completeTimeout: 30 });
            try {
                m.registerDownload('hash-comp', Buffer.from('z'), 'text/plain', 'client-1');
                m.getDownload('hash-comp', 'client-1'); // downloadStarted=true, completeTimeout begins
                await new Promise((r) => setTimeout(r, 60));
                expect(m.pendingDownloads.has('hash-comp')).toBe(false);
            } finally {
                m.destroy();
            }
        });

        // Scenario: getDownload called twice — the second call sees
        // entry.downloadStarted already true and skips the timer swap.
        // Exercises the falsy branch of `if (!entry.downloadStarted)` at L459.
        test('second getDownload sees downloadStarted=true and skips timer swap', () => {
            const m = new FileTransferManager({ startTimeout: 1000, completeTimeout: 1000 });
            try {
                m.registerDownload('hash-twice', Buffer.from('y'), 'text/plain', 'client-1');
                m.getDownload('hash-twice', 'client-1'); // first — sets downloadStarted=true
                const entry = m.pendingDownloads.get('hash-twice');
                const timerBefore = entry.timer;
                m.getDownload('hash-twice', 'client-1'); // second — timer must NOT be swapped
                expect(m.pendingDownloads.get('hash-twice').timer).toBe(timerBefore);
            } finally {
                m.destroy();
            }
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

describe('FileTransferManager - periodic cleanup', () => {
    // Scenario: _cleanup reaps a download entry whose age has exceeded
    // startTimeout + completeTimeout. Calling _cleanup() directly avoids
    // the fake-timer + entry-timer race that would empty the map before
    // the loop runs.
    test('_cleanup reaps expired downloads', () => {
        const manager = new FileTransferManager({ startTimeout: 30000, completeTimeout: 30000 });
        try {
            manager.registerDownload('hash-old', Buffer.from('x'), 'text/plain', 'c1');
            const entry = manager.pendingDownloads.get('hash-old');
            entry.createdAt = Date.now() - 1000000;
            manager._cleanup();
            expect(manager.pendingDownloads.has('hash-old')).toBe(false);
        } finally {
            manager.destroy();
        }
    });

    // Scenario: cleanup also rejects pending uploads whose deadlines have
    // passed. The promise from registerUpload resolves to an error.
    // Scenario: _cleanup runs while no entry has aged out — both per-entry
    // age checks must take their falsy branch. Exercises L624 and L632.
    test('periodic cleanup with fresh entries leaves them in place', () => {
        const manager = new FileTransferManager({ startTimeout: 30000, completeTimeout: 30000 });
        try {
            manager.registerDownload('hash-fresh', Buffer.from('x'), 'text/plain', 'c1');
            const p = manager.registerUpload('q1', 'hash-up-fresh', 'c1');
            p.catch(() => {});
            manager._cleanup();
            expect(manager.pendingDownloads.has('hash-fresh')).toBe(true);
            expect(manager.pendingUploads.has('q1/hash-up-fresh')).toBe(true);
        } finally {
            manager.destroy();
        }
    });

    test('periodic cleanup rejects expired pending uploads', async () => {
        const manager = new FileTransferManager({ startTimeout: 30000, completeTimeout: 30000 });
        const p = manager.registerUpload('q1', 'hash-up', 'c1');
        p.catch(() => {});
        const key = 'q1/hash-up';
        const entry = manager.pendingUploads.get(key);
        // Age the entry past maxAge
        entry.createdAt = Date.now() - 1000000;
        // Call _cleanup directly to drive the upload-expiry branch
        manager._cleanup();
        expect(manager.pendingUploads.has(key)).toBe(false);
        manager.destroy();
    });
});

describe('getFileTransferManager', () => {
    afterAll(() => {
        // Clean up singleton to prevent open handle warning
        const { resetFileTransferManager } = require('./fileTransfer');
        resetFileTransferManager();
    });

    test('returns same instance on multiple calls', () => {
        const { getFileTransferManager: getFTM } = require('./fileTransfer');
        const instance1 = getFTM();
        const instance2 = getFTM();
        expect(instance1).toBe(instance2);
    });
});
