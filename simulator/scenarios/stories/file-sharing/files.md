# File Sharing Stories Module Files

This module contains test suites for api-ape's binary file transfer functionality. These tests verify upload, download, and client-to-client file sharing.

## Guidelines

- **Use Buffers** — Always use `Buffer` for binary data, not strings
- **Verify integrity** — Compare uploaded and downloaded data byte-for-byte
- **Longer timeouts** — File transfers may need 5000ms+ timeout for large files
- **Hash tracking** — Use returned hashes to track files for download

## Directory Structure

```
file-sharing/
├── index.test.js            # Main test file that imports all scenarios
├── file-upload/             # Tests for uploading files
├── file-download/           # Tests for downloading files
├── client-to-client-sharing/ # Tests for sharing files between clients
└── large-files/             # Tests for larger file transfers
```

## Directories

### `file-upload/`

Tests for uploading binary data to the server, including hash generation and duplicate handling.

### `file-download/`

Tests for downloading binary data from the server, including error handling for missing files.

### `client-to-client-sharing/`

Tests for sharing files between clients via the `<!F>` tag broadcast mechanism.

### `large-files/`

Tests for handling larger file transfers (1MB+) including streaming and chunking.
