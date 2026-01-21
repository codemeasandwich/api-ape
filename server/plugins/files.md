# Plugins Module

Binary data handling utilities for api-ape servers.

## Directory Structure

```
plugins/
├── files.md    # This file
└── binary.js   # Binary data type helpers
```

## Files

### `binary.js`

Binary data type checking utilities for determining how to transfer data.

- `isBinaryData(value)` - Check if value is Buffer, ArrayBuffer, or TypedArray
- `getBase64Length(value)` - Calculate base64 encoded length of binary data
- `INLINE_BASE64_THRESHOLD` - Size threshold (100 chars) for inline vs link encoding
