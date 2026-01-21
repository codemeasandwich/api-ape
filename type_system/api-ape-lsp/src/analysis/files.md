# Analysis Module

Document analysis for api-ape proxy chain detection and diagnostics.

## Directory Structure

```
analysis/
├── files.md     # This file
└── analyzer.js  # Document analyzer
```

## Files

### `analyzer.js`

Analyzes source code to find api-ape proxy chain patterns and provide diagnostics.

- `analyzeDocument(document, schema)` - Analyze document and return diagnostics
- `extractApiCalls(text)` - Extract api-ape calls from text
- `extractApiCallsWithArgs(text)` - Extract calls with argument objects
- `findApiChainAtPosition(document, position)` - Find api chain at cursor
- `getRequiredParams(inputType)` - Get required parameter names
- `parseObjectProperties(objStr)` - Parse object literal properties
