# CLI Source

Core implementation for the api-ape CLI type generator.

## Directory Structure

```
src/
├── files.md          # This file
├── cli.js            # CLI argument handling
├── index.js          # Main entry point
├── jsdoc-parser.js   # JSDoc extraction
└── type-generator.js # TypeScript output
```

## Files

### `cli.js`

CLI implementation using Commander.js. Parses command-line arguments, handles watch mode for file changes, and orchestrates type generation.

### `index.js`

Core schema generation functions.

- `generateSchema(controllersDir, options)` - Scan controllers and build schema

### `jsdoc-parser.js`

JSDoc comment extraction and parsing.

- `parseJSDoc(filePath)` - Extract documentation from file
- `parseJSDocBlock(comment)` - Parse JSDoc comment block
- `parseTypeString(typeStr)` - Parse type annotations

### `type-generator.js`

TypeScript type definition generation.

- `generateTypes(schema)` - Generate TypeScript from schema
- `typeDefToTypeScript(typeDef)` - Convert TypeDefinition to TS string
