# Schema Source

Schema generation and extraction implementation.

## Directory Structure

```
src/
├── files.md              # This file
├── index.js              # Main entry point
├── index.d.ts            # TypeScript declarations
├── generator.js          # Schema generator
├── type-generator.js     # TypeScript type generator
├── jsdoc-parser.js       # JSDoc parsing
├── extractor.js          # Unified extractor
├── export-extractor.js   # Export-based extraction
└── typescript-extractor.js # TypeScript extraction
```

## Files

### `index.js`

Main entry point. Re-exports schema generation functions.

### `index.d.ts`

TypeScript declarations for the package API.

### `generator.js`

Schema generator that scans controller directories.

- `generateSchema(controllersDir, options)` - Generate schema from controllers

### `type-generator.js`

TypeScript type definition generator.

- `generateTypes(schema)` - Generate TypeScript from schema
- `typeDefToTypeScript(typeDef)` - Convert TypeDefinition to TS

### `jsdoc-parser.js`

JSDoc comment extraction and parsing.

- `parseJSDoc(filePath)` - Extract JSDoc from file
- `parseTypeString(typeStr)` - Parse type string

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
