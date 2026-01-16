# File Download Test Scenario Files

Tests verifying file download functionality.

## Directory Structure

```
file-download/
├── can-download-uploaded-file.js
└── download-nonexistent-throws.js
```

## Files

### `can-download-uploaded-file.js`

Tests that a file can be uploaded and then downloaded using the returned hash, with correct name, size, and data.

### `download-nonexistent-throws.js`

Tests that attempting to download a file with a non-existent hash throws an appropriate error.
