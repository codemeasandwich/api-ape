# CLI Source Files

Core implementation for @api-ape/cli.

## Directory Structure

```
src/
├── files.md          # This file
├── cli.js            # CLI entry point
├── index.js          # Main exports
├── jsdoc-parser.js   # JSDoc parsing
└── type-generator.js # TypeScript generation
```

## Files

### `cli.js`

CLI implementation using Commander.js. Handles command-line arguments and watch mode.

### `index.js`

Main entry point. Exports `generateSchema`, `generateTypes`, `parseJSDoc`, `parseTypeString`.

### `jsdoc-parser.js`

JSDoc comment extraction and parsing utilities.

### `type-generator.js`

TypeScript declaration generation from schema.
