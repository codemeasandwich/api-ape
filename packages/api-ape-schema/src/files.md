# Schema Package Source

Core implementation for @api-ape/schema.

## Directory Structure

```
src/
├── files.md          # This file
├── index.js          # Main exports
├── index.d.ts        # TypeScript declarations
├── generator.js      # Schema generator
├── jsdoc-parser.js   # JSDoc parsing
└── type-generator.js # TypeScript type generation
```

## Files

### `index.js`

Main entry point exporting schema utilities.

### `index.d.ts`

TypeScript type declarations for the package.

### `generator.js`

Schema generation from controller directories.

### `jsdoc-parser.js`

JSDoc comment parsing utilities.

### `type-generator.js`

TypeScript declaration generation from schema.
