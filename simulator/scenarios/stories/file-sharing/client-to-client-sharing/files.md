# Client To Client Sharing Test Scenario Files

Tests verifying file sharing between clients.

## Directory Structure

```
client-to-client-sharing/
├── other-client-can-download.js
└── upload-broadcasts-to-others.js
```

## Files

### `other-client-can-download.js`

Tests that a file uploaded by one client can be downloaded by another client using the returned hash.

### `upload-broadcasts-to-others.js`

Tests that when a client uploads a file, a `file-shared` notification is broadcast to all other clients (but not the uploader).
