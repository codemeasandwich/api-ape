# @api-ape/cli

CLI tool for generating TypeScript types from api-ape controllers.

## Directory Structure

```
api-ape-cli/
├── files.md       # This file
├── package.json   # Package configuration
├── bin/
│   └── api-ape-types.js  # CLI entry point
└── src/
    ├── cli.js           # CLI implementation
    ├── index.js         # Core functions
    ├── jsdoc-parser.js  # JSDoc parsing
    └── type-generator.js # TypeScript generation
```

## Files

### `package.json`

Package configuration for @api-ape/cli npm package.

### `bin/api-ape-types.js`

CLI executable entry point. Invokes the CLI module.

### `src/cli.js`

CLI implementation using Commander.js.

- Parses command-line arguments
- Handles watch mode for file changes
- Orchestrates type generation

### `src/index.js`

Core schema generation functions.

- `generateSchema(controllersDir, options)` - Scan controllers and build schema
- Re-exports from jsdoc-parser and type-generator

### `src/jsdoc-parser.js`

JSDoc comment extraction and parsing.

- `parseJSDoc(filePath)` - Extract documentation from file
- `parseJSDocBlock(comment)` - Parse JSDoc comment block
- `parseTypeString(typeStr)` - Parse type annotations
- `findExportLine(content)` - Find export statement line

### `src/type-generator.js`

TypeScript declaration generation.

- `generateTypes(schema)` - Generate .d.ts content from schema
- `typeDefToString(typeDef)` - Convert type definition to string
- `groupByNamespace(endpoints)` - Group endpoints by namespace
- `toPascalCase(str)` - Convert string to PascalCase
