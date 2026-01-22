# Schema Source

Schema generation and extraction implementation.

## Directory Structure

```
src/
├── files.md                # This file
├── index.js                # Main entry point
├── index.d.ts              # TypeScript declarations
├── generator.js            # Schema generator
├── type-generator.js       # TypeScript type generator
├── jsdoc-parser.js         # JSDoc parsing
├── extractor.js            # Unified extractor
├── export-extractor.js     # Export-based extraction
├── typescript-extractor.js    # TypeScript extraction
├── typescript-type-converter.js # TypeScript type converter
├── reserved-names.js       # Reserved proxy property names
├── ts-type-parser.js       # TypeScript type string parser
├── ts-type-parser-core.js  # Core type parsing functions
└── ts-type-parser-utils.js # Type parser utility functions
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
- `getTypeScript()` - Lazily load TypeScript module

### `typescript-type-converter.js`

TypeScript type to TypeDefinition converter.

- `typeToTypeDef(checker, type, seen)` - Convert TS type to TypeDefinition
- `setTypeScript(typescript)` - Set TypeScript module reference

### `reserved-names.js`

Reserved proxy property names that cannot be used as endpoint names.

- `PROXY_RESERVED` - Set of reserved property names
- `isProxyReserved(name)` - Check if name is reserved

### `ts-type-parser.js`

TypeScript type string parser for extracting schema from type annotations.

- `extractSchemaFromTsTypes(filePath)` - Extract schema from TS types
- `parseTypeString(typeStr)` - Parse a type string

### `ts-type-parser-core.js`

Core type parsing functions for TypeScript type strings.

- `parseType(typeStr)` - Parse type string into TypeDefinition
- `parseObjectType(typeStr)` - Parse object type literal
- `parseParams(paramsStr)` - Parse function parameters

### `ts-type-parser-utils.js`

Utility functions for TypeScript type parsing.

- `findMatchingBracket(str, start, open, close)` - Find matching bracket
- `splitByOperator(str, operator)` - Split by operator respecting nesting
- `splitByComma(str)` - Split by comma respecting nesting
- `splitProperties(str)` - Split object properties
