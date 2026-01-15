# File Sharing Variations Test Scenario Files

Tests file sharing edge cases and variations.

## Directory Structure

```
developer-file-sharing-variations/
├── download-non-existent-file-shows-error.js
├── file-upload-with-broadcast-to-others.js
└── large-file-survives-round-trip.js
```

## Files

### download-non-existent-file-shows-error.js

Tests that downloading a non-existent file throws a "not found" error without breaking the connection.

### file-upload-with-broadcast-to-others.js

Tests that uploading a file with broadcast enabled notifies other connected clients.

### large-file-survives-round-trip.js

Tests that a large file (100KB) can be uploaded and downloaded with correct size verification.
