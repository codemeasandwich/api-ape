# Schema Module

HTTP endpoint and utilities for schema introspection in api-ape servers.

## Directory Structure

```
schema/
├── __fixtures__/           # Test fixtures
│   ├── test-endpoint.js
│   ├── export-schema.js
│   └── typescript-endpoint.ts
├── files.md                # This file
├── index.js                # Schema HTTP handler and generator
├── index.test.js           # Tests for index.js
├── jsdoc-parser.js         # JSDoc parsing utilities
├── extractor.js            # Unified schema extractor
├── extractor.test.js       # Tests for extractor
├── export-extractor.js     # Export-based extraction
├── typescript-extractor.js # TypeScript extraction
└── README.md               # Module documentation
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

### `extractor.js`

Unified schema extractor with priority-based extraction.

- `extractSchema(filePath)` - Extract schema using all methods
- `getSupportedExtensions()` - Get supported file extensions
- `shouldProcessFile(filePath)` - Check if file should be processed

### `export-extractor.js`

Export-based schema extraction from module.exports.schema.

- `extractSchemaFromExport(filePath)` - Extract from named export
- `normalizeTypeDef(def)` - Normalize to TypeDefinition format

### `typescript-extractor.js`

TypeScript-based schema extraction using the TS compiler API.

- `extractSchemaFromTypeScript(filePath)` - Extract from TS file
- `findCompanionDts(jsFilePath)` - Find companion .d.ts file
- `typeToTypeDef(checker, type)` - Convert TS type to TypeDefinition

### `README.md`

Documentation for the schema module.
