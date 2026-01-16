# File Upload Test Scenario Files

Tests verifying file upload functionality.

## Directory Structure

```
file-upload/
├── can-upload-binary-file.js
├── same-content-same-hash.js
└── upload-generates-unique-hash.js
```

## Files

### `can-upload-binary-file.js`

Tests that a binary file can be uploaded and returns success with a hash, name, and correct size.

### `same-content-same-hash.js`

Tests that uploading files with identical content produces the same hash, regardless of filename.

### `upload-generates-unique-hash.js`

Tests that uploading files with different content produces unique hashes.
