# Schema Module

HTTP endpoint and utilities for schema introspection in api-ape servers.

## Directory Structure

```
schema/
├── files.md          # This file
├── index.js          # Schema HTTP handler and generator
├── jsdoc-parser.js   # JSDoc parsing utilities
└── README.md         # Module documentation
```

## Files

### `index.js`

Schema HTTP endpoint handler and schema generation.

- `createSchemaHandler(controllersDir)` - Create HTTP handler for schema endpoint
- `refreshSchema(controllersDir)` - Refresh cached schema
- `generateSchema(controllersDir)` - Generate schema from controllers

### `jsdoc-parser.js`

JSDoc parsing for controller documentation extraction.

- `parseJSDoc(filePath)` - Extract JSDoc from controller file
- `parseTypeString(typeStr)` - Parse type string into TypeDefinition

### `README.md`

Documentation for the schema module.
