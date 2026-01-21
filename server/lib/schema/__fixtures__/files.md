# Schema Test Fixtures

Test fixtures for schema introspection tests.

## Directory Structure

```
__fixtures__/
├── files.md               # This file
├── test-endpoint.js       # Basic endpoint test fixture
├── export-schema.js       # Export-based schema test fixture
└── typescript-endpoint.ts # TypeScript endpoint test fixture
```

## Files

### `test-endpoint.js`

Sample controller endpoint used by schema introspection tests. Returns a greeting message based on the name parameter.

### `export-schema.js`

Test fixture for export-based schema extraction. Demonstrates the module.exports.schema pattern with input and output type definitions.

### `typescript-endpoint.ts`

Test fixture for TypeScript schema extraction. Demonstrates TypeScript endpoint with typed function signature.
