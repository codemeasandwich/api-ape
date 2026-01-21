# @api-ape/schema

Schema generation utilities for api-ape.

## Directory Structure

```
api-ape-schema/
├── files.md       # This file
├── package.json   # Package configuration
└── src/
    ├── index.js        # Main exports
    ├── index.d.ts      # TypeScript declarations
    ├── generator.js    # Schema generator
    ├── jsdoc-parser.js # JSDoc parsing
    └── type-generator.js # TypeScript type generation
```

## Files

### `package.json`

Package configuration for @api-ape/schema npm package.

### `src/index.js`

Main entry point exporting schema utilities.

### `src/index.d.ts`

TypeScript type declarations for the package.

### `src/generator.js`

Schema generation from controller directories.

- `generateSchema(controllersDir, options)` - Generate schema object

### `src/jsdoc-parser.js`

JSDoc comment parsing utilities.

- `parseJSDoc(filePath)` - Parse JSDoc from file
- `parseTypeString(typeStr)` - Parse type annotations

### `src/type-generator.js`

TypeScript declaration generation from schema.

- `generateTypes(schema)` - Generate .d.ts content
