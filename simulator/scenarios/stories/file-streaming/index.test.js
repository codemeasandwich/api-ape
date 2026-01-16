/**
 * @fileoverview File Streaming User Stories - Edge case testing for file transfers
 *
 * Tests file streaming functionality through api-ape's public interface:
 * - Large file streaming (> 1MB with chunking)
 * - Concurrent file transfers
 * - Binary tag system (<!B> and <!A>)
 * - Streaming file completion
 * - Error handling
 *
 * @module simulator/scenarios/stories/file-streaming
 */

const { Harness } = require('../../../harness');

// Extend timeout for large file tests
jest.setTimeout(60000);

// Large File Streaming (FS1)
const canUpload2mbFileWithChunking = require('./large-file-streaming/can-upload-2mb-file-with-chunking');
const canDownloadLargeUploadedFile = require('./large-file-streaming/can-download-large-uploaded-file');

// Concurrent Transfers (FS2)
const multipleClientsUploadSimultaneously = require('./concurrent-transfers/multiple-clients-upload-simultaneously');
const singleClientMultipleUploads = require('./concurrent-transfers/single-client-multiple-uploads');
const interleavedUploadDownload = require('./concurrent-transfers/interleaved-upload-download');

// Binary Tags (FS3)
const bufferTagUpload = require('./binary-tags/buffer-tag-upload');
const arrayBufferTagUpload = require('./binary-tags/arraybuffer-tag-upload');
const multipleBinaryFieldsInOneMessage = require('./binary-tags/multiple-binary-fields-in-one-message');
const binaryDataIntegrityPreserved = require('./binary-tags/binary-data-integrity-preserved');

// Streaming Completion (FS4)
const streamingFileRegistersAndCompletes = require('./streaming-completion/streaming-file-registers-and-completes');
const partialReadWhileStreaming = require('./streaming-completion/partial-read-while-streaming');
const fileAvailableAfterCompletion = require('./streaming-completion/file-available-after-completion');

// Error Handling (FS5)
const uploadWithoutDataThrows = require('./error-handling/upload-without-data-throws');
const downloadInvalidHashThrows = require('./error-handling/download-invalid-hash-throws');
const downloadWithoutHashThrows = require('./error-handling/download-without-hash-throws');
const emptyFileUploadThrows = require('./error-handling/empty-file-upload-throws');
const concurrentDownloadFailureIsolated = require('./error-handling/concurrent-download-failure-isolated');

jest.setTimeout(30000); // Large file tests need more time

describe('File Streaming User Stories', () => {
  let harness;

  beforeEach(() => {
    jest.resetModules();
    harness = new Harness({ basePort: 19000 });

    // Reset file store
    const uploadModule = require('../../../test-api/files/upload');
    uploadModule._reset();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  describe('Large File Streaming (FS1)', () => {
    test('can upload 2MB file with chunking', async () => {
      await canUpload2mbFileWithChunking({ harness, expect });
    }, 120000);

    test('can download large uploaded file', async () => {
      await canDownloadLargeUploadedFile({ harness, expect });
    });
  });

  describe('Concurrent File Transfers (FS2)', () => {
    test('multiple clients upload simultaneously', async () => {
      await multipleClientsUploadSimultaneously({ harness, expect });
    });

    test('single client multiple uploads', async () => {
      await singleClientMultipleUploads({ harness, expect });
    });

    test('interleaved upload and download', async () => {
      await interleavedUploadDownload({ harness, expect });
    });
  });

  describe('Binary Tags (FS3)', () => {
    test('buffer tag upload (<!B>)', async () => {
      await bufferTagUpload({ harness, expect });
    });

    test('arraybuffer tag upload (<!A>)', async () => {
      await arrayBufferTagUpload({ harness, expect });
    });

    test('multiple binary fields in one message', async () => {
      await multipleBinaryFieldsInOneMessage({ harness, expect });
    });

    test('binary data integrity preserved', async () => {
      await binaryDataIntegrityPreserved({ harness, expect });
    });
  });

  describe('Streaming File Completion (FS4)', () => {
    test('streaming file registers and completes', async () => {
      await streamingFileRegistersAndCompletes({ harness, expect });
    });

    test('partial read while streaming', async () => {
      await partialReadWhileStreaming({ harness, expect });
    });

    test('file available after completion', async () => {
      await fileAvailableAfterCompletion({ harness, expect });
    });
  });

  describe('File Transfer Error Handling (FS5)', () => {
    test('upload without data throws', async () => {
      await uploadWithoutDataThrows({ harness, expect });
    });

    test('download invalid hash throws', async () => {
      await downloadInvalidHashThrows({ harness, expect });
    });

    test('download without hash throws', async () => {
      await downloadWithoutHashThrows({ harness, expect });
    });

    test('empty file upload throws', async () => {
      await emptyFileUploadThrows({ harness, expect });
    });

    test('concurrent download failure isolated', async () => {
      await concurrentDownloadFailureIsolated({ harness, expect });
    });
  });
});
