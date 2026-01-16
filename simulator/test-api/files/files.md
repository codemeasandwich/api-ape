# Files Controllers Module Files

This module provides test controllers for binary file transfer functionality. These controllers handle file upload and download operations.

## Guidelines

- **Buffer handling** — Binary data arrives as Buffer, return Buffer for downloads
- **Hash tracking** — Use hashes to identify files for download
- **Session verification** — Binary transfers verify client session automatically

## Directory Structure

```
files/
├── upload.js    # File upload handler (maps to 'files/upload')
└── download.js  # File download handler (maps to 'files/download')
```

## Files

### `upload.js`

Receives binary file uploads. Returns upload confirmation including generated hash. Used to test the `<!B>` tag upload flow.

### `download.js`

Sends binary file data to clients. Returns file with name and data properties. Used to test the `<!A>` tag download flow.
