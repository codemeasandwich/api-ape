# Utilities Module

Shared utility functions for the api-ape LSP server.

## Directory Structure

```
utils/
├── files.md          # This file
├── documentUtils.js  # Document parsing utilities
├── stringUtils.js    # String matching utilities
└── typeFormatter.js  # Type formatting utilities
```

## Files

### `documentUtils.js`

Document parsing utilities for extracting and analyzing code.

- `parseObjectProperties(objStr)` - Parse object literal to extract property names
- `positionFromOffset(text, offset)` - Get position from offset in text
- `getRequiredParams(inputType)` - Get required parameter names from input type

### `stringUtils.js`

String comparison and similarity functions for endpoint suggestions.

- `levenshteinDistance(a, b)` - Calculate edit distance between strings
- `findSimilarEndpoints(path, endpoints)` - Find similar endpoint paths

### `typeFormatter.js`

Type formatting utilities for LSP providers.

- `formatType(typeDef, options)` - Format TypeDefinition as TypeScript string
- `formatTypeForCompletion(typeDef)` - Format for completion items
- `formatTypeForHover(typeDef)` - Format for hover with descriptions
- `formatTypeForSignature(typeDef)` - Format abbreviated for signatures
