# Large file streaming scenario helpers

Shared story implementations for FS1 large-upload / download flows.

## Directory Structure

```
large-file-streaming/
├── can-download-large-uploaded-file.js
└── can-upload-2mb-file-with-chunking.js
```

## Files

### `can-download-large-uploaded-file.js`

Uploads a ~1.5 MB patterned buffer then downloads by hash, asserting size and payload integrity (uses extended RPC timeouts for stability under full-suite load).

### `can-upload-2mb-file-with-chunking.js`

Covers multi-chunk upload behavior for the FS1 story suite.
