# Files Actions Module Files

This module provides atomic operations for testing binary file transfers in api-ape. These actions cover upload, download, and client-to-client file sharing.

## Guidelines

- **Binary data** — Always use `Buffer` for binary data, not strings
- **Hash verification** — Use hash values to verify file integrity
- **Longer timeouts** — File transfers may need longer timeouts (5000ms) for large files
- **Cleanup** — Test files are temporary; the server cleans up after timeout

## Directory Structure

```
files/
├── index.js              # Module entry point, re-exports all actions
├── upload.js             # Upload binary file to server
├── uploadMany.js         # Upload multiple files
├── download.js           # Download binary file from server
├── downloadAndVerify.js  # Download and verify against original
├── share.js              # Share file between clients via broadcast
├── downloadShared.js     # Download a file shared by another client
├── roundTrip.js          # Upload then download, verify integrity
├── createTestData.js     # Create random binary test data
├── createTypedTestFile.js # Create test file of specific type (PNG, etc.)
├── assertDataEquals.js   # Assert two binary buffers are equal
└── assertSize.js         # Assert file size matches expected
```

## Files

### `index.js`

Module entry point that re-exports all file actions for convenient importing.

### `upload.js`

Uploads binary data to a server endpoint. Uses `client.callWithBinary()` for tagged uploads.

### `uploadMany.js`

Uploads multiple files sequentially or in parallel.

### `download.js`

Downloads binary data from a server endpoint. Returns Buffer.

### `downloadAndVerify.js`

Downloads a file and verifies it matches the expected data.

### `share.js`

Shares a file with other clients by uploading with `<!F>` tag for broadcast.

### `downloadShared.js`

Downloads a file that was shared by another client via broadcast.

### `roundTrip.js`

Performs complete upload → download cycle and verifies data integrity.

### `createTestData.js`

Creates random binary test data of specified size.

### `createTypedTestFile.js`

Creates test file with proper headers for specific file types (PNG, JPEG, etc.).

### `assertDataEquals.js`

Asserts that two Buffer instances contain identical data.

### `assertSize.js`

Asserts that file data is exactly the expected size in bytes.
