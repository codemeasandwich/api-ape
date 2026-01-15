# Files Actions Module

## Overview

The files actions module provides atomic operations for testing binary file transfers in api-ape. These actions cover upload, download, and client-to-client file sharing.

**Key capabilities:**

- **Upload operations** — Upload binary data to server via tagged messages
- **Download operations** — Download binary data from server
- **Client-to-client** — Share files between clients via broadcast
- **Verification** — Verify file integrity after transfer
- **Test data generation** — Create test files of various sizes and types

Binary transfers use api-ape's tag system (`<!B>`, `<!A>`, `<!F>`) with HTTP endpoints.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Usage

```javascript
const files = require('../actions/files');

// Upload a file
const result = await files.upload({
  client,
  endpoint: 'files/upload',
  filename: 'test.png',
  data: Buffer.from([0x89, 0x50, 0x4E, 0x47])
});

// Download and verify
const downloaded = await files.download({ client, endpoint: 'files/download', hash: result.hash });
await files.assertDataEquals({ expected: uploaded, actual: downloaded });
```

## See Also

- [`../README.md`](../README.md) — Actions overview
- [`../../stories/file-sharing/README.md`](../../stories/file-sharing/README.md) — File sharing stories
