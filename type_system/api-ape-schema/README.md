# @api-ape/schema

Schema generator for api-ape - extracts endpoint metadata from controller files.

## Overview

This package provides the core schema generation functionality used by the server-side schema endpoint and tooling packages. It extracts type information from api-ape controller files using multiple methods:

- **Named schema exports** (highest priority) - Explicit `module.exports.schema` definitions
- **TypeScript definitions** - Types from `.ts` files or companion `.d.ts` files
- **JSDoc comments** (fallback) - Traditional `@param` and `@returns` tags

The extractor automatically detects the best available type information for each controller.

## Installation

```bash
npm install @api-ape/schema
```

## Usage

### Basic Schema Generation

```javascript
const { generateSchema, generateTypeDeclarations } = require('@api-ape/schema');
const path = require('path');

// Generate schema from controller directory
const controllersDir = path.resolve('./api');
const schema = generateSchema(controllersDir);

console.log(schema);
// {
//   version: "abc12345",
//   timestamp: 1705840800000,
//   controllersDir: "/path/to/api",
//   endpoints: [{ path: "users/profile", schemaSource: "jsdoc", ... }],
//   channels: []  // Note: Channel extraction is not yet implemented
// }

// Generate TypeScript declarations
const dts = generateTypeDeclarations(schema);
console.log(dts);
// declare module 'api-ape' { ... }
```

### Parsing Individual Files

```javascript
const { parseJSDoc } = require('@api-ape/schema');

const doc = parseJSDoc('/path/to/api/users/profile.js');
console.log(doc);
// {
//   filePath: '/path/to/api/users/profile.js',
//   description: 'Get user profile by ID',
//   input: { kind: 'object', properties: { userId: { kind: 'primitive', name: 'string' } } },
//   output: { kind: 'object', properties: { name: {...}, email: {...} } },
//   throws: ['Error: User not found'],
//   line: 15
// }
```

## API Reference

### `generateSchema(controllersDir, options?)`

Generates a complete schema from a directory of controller files.

**Parameters:**
- `controllersDir` (string): Absolute path to the controllers directory
- `options` (object, optional):
  - `extensions` (string[]): File extensions to include (default: `['js', 'ts']`). Extensions can be provided with or without leading dots (e.g., `['js']` or `['.js']`).

**Returns:** `ApeSchema` object

```typescript
interface ApeSchema {
  version: string;           // MD5 hash for cache invalidation
  timestamp: number;         // Generation timestamp
  controllersDir: string;    // Source directory
  endpoints: EndpointDefinition[];
  channels: ChannelDefinition[];  // Note: Always empty - channel extraction not yet implemented
}
```

### `parseJSDoc(filePath)`

Extracts JSDoc documentation from a single controller file.

**Parameters:**
- `filePath` (string): Absolute path to the controller file

**Returns:** `ControllerDoc` object

```typescript
interface ControllerDoc {
  filePath: string;
  description: string | null;
  input: TypeDefinition | null;
  output: TypeDefinition | null;
  throws: string[];
  line: number;
}
```

### `generateTypeDeclarations(schema)`

Generates TypeScript declaration file content from a schema.

**Parameters:**
- `schema` (ApeSchema): The schema object

**Returns:** `string` - TypeScript `.d.ts` file content

### `parseTypeString(typeStr)`

Parses a JSDoc type string into a structured TypeDefinition.

**Parameters:**
- `typeStr` (string): JSDoc type string (e.g., `"{string}"`, `"Promise<User>"`)

**Returns:** `TypeDefinition` object

### `extractSchema(filePath)`

Extracts schema from a controller file using all available methods (export, TypeScript, JSDoc).

**Parameters:**
- `filePath` (string): Absolute path to the controller file

**Returns:** `object` with `input`, `output`, `description`, `throws`, `line`, and `source` properties

```javascript
const { extractSchema } = require('@api-ape/schema');

const schema = extractSchema('/path/to/api/users/profile.js');
console.log(schema.source); // 'export' | 'typescript' | 'jsdoc'
```

### `extractSchemaFromExport(filePath)`

Extracts schema from a module's named `schema` export.

**Parameters:**
- `filePath` (string): Absolute path to a `.js` controller file

**Returns:** `object | null` - Schema object or null if no schema export found

**Returns `null` when:**
- File is not a `.js` file
- Module has no `schema` export
- Module has syntax errors or fails to load
- `require()` fails for any reason (missing dependencies, etc.)

### `extractSchemaFromTypeScript(filePath)`

Extracts schema from a TypeScript file using the TypeScript compiler API.

**Parameters:**
- `filePath` (string): Absolute path to a `.ts` or `.d.ts` file

**Returns:** `object | null` - Schema object or null if extraction failed

**Notes:**
- Requires `typescript` to be installed as a peer dependency.
- Only extracts type information from TypeScript files. JSDoc descriptions in `.ts` files are **not** extracted—use the named schema export method if you need descriptions with TypeScript.

### `getSupportedExtensions()`

Returns the list of supported file extensions with leading dots.

**Returns:** `string[]` - `['.js', '.ts']`

**Note:** This returns extensions with dots (e.g., `'.js'`), while the `options.extensions` parameter in `generateSchema` accepts extensions with or without dots.

### `shouldProcessFile(filePath)`

Checks if a file should be processed for schema extraction.

**Parameters:**
- `filePath` (string): Path to check

**Returns:** `boolean` - `false` for `.d.ts` files and unsupported extensions

### `normalizeTypeDef(def)`

Normalizes a simple type definition to the full TypeDefinition format. Used internally by `extractSchemaFromExport` but also available for custom schema processing.

**Parameters:**
- `def` (object | string | null): Type definition in simple or full format

**Returns:** `TypeDefinition | null` - Normalized TypeDefinition or null if invalid

```javascript
const { normalizeTypeDef } = require('@api-ape/schema');

// String shorthand (primitive types are case-normalized)
normalizeTypeDef('string');
// { kind: 'primitive', name: 'string', raw: 'string' }

normalizeTypeDef('String');  // Uppercase input
// { kind: 'primitive', name: 'string', raw: 'String' }  // name is lowercased, raw preserves original

// Reference type (non-primitives keep original case)
normalizeTypeDef('Date');
// { kind: 'reference', name: 'Date', raw: 'Date' }

// Object with shorthand properties
normalizeTypeDef({ name: 'string', age: 'number' });
// { kind: 'object', properties: { name: {...}, age: {...} }, raw: 'object' }

// Object with explicit type/required
normalizeTypeDef({ email: { type: 'string', required: true } });
// { kind: 'object', properties: { email: { kind: 'primitive', name: 'string', optional: false } } }
```

**Notes:**
- Primitive type names (`string`, `number`, `boolean`, etc.) are normalized to lowercase in the `name` field, while `raw` preserves the original input.
- When using the `{ type, required }` format, properties without `required: true` are treated as optional by default.

### `findCompanionDts(jsFilePath)`

Checks if a companion `.d.ts` file exists for a JavaScript file.

**Parameters:**
- `jsFilePath` (string): Path to a `.js` file

**Returns:** `string | null` - Path to `.d.ts` file if it exists, null otherwise

```javascript
const { findCompanionDts } = require('@api-ape/schema');

findCompanionDts('/api/users/profile.js');
// Returns '/api/users/profile.d.ts' if it exists, null otherwise

findCompanionDts('/api/users/profile.ts');
// Returns null (only works with .js files)
```

## Schema Format

### EndpointDefinition

```typescript
interface EndpointDefinition {
  path: string;              // "users/profile"
  filePath: string;          // Absolute path to controller
  line: number;              // Line number of export (1-indexed)
  column: number;            // Column number
  description: string | null;
  input: TypeDefinition | null;
  output: TypeDefinition | null;
  throws: string[];          // Format: ["ErrorType: message", ...]
  schemaSource: 'export' | 'typescript' | 'jsdoc';  // How types were extracted
}
```

**Notes:**
- The `column` field is currently always `1` as column-level precision is not yet implemented. Do not rely on this value for precise source location.
- The `throws` array contains strings in the format `"ErrorType: message"` (e.g., `"Error: User not found"`).

### TypeDefinition

```typescript
interface TypeDefinition {
  kind: 'primitive' | 'reference' | 'array' | 'union' | 'promise' | 'object' | 'literal' | 'record' | 'any';
  name?: string;             // For primitives and references
  raw?: string;              // Original type string
  description?: string;      // From @param description
  optional?: boolean;        // For object properties
  items?: TypeDefinition;    // For arrays
  types?: TypeDefinition[];  // For unions
  resolves?: TypeDefinition; // For promises
  properties?: Record<string, TypeDefinition>; // For objects
  value?: string | number;   // For literal types
  key?: TypeDefinition;      // For record types (index signature key)
}
```

**Type Kinds:**

| Kind | Description | Example |
|------|-------------|---------|
| `primitive` | Built-in types | `string`, `number`, `boolean`, `null`, `undefined`, `void`, `any`, `never`, `unknown` |
| `reference` | Named types | `Date`, `User`, `CustomType` |
| `array` | Array types | `string[]`, `Array<User>` |
| `union` | Union types | `string \| number` |
| `promise` | Promise types | `Promise<User>` |
| `object` | Object with properties | `{ name: string }` |
| `literal` | Literal types (TypeScript only) | `'active'`, `42` |
| `record` | Index signatures (TypeScript only) | `{ [key: string]: number }`, `Record<string, T>` |
| `any` | Unknown/fallback type | When type cannot be determined |

## Schema Declaration Methods

The schema extractor supports three methods for declaring endpoint types. The extractor tries them in priority order and uses the first one that provides type information.

### Method 1: Named Schema Export (Recommended)

The most explicit and flexible method. Export a `schema` property alongside your handler function.

> **Important:** You must use `module.exports.schema`, not `exports.schema`. The latter will not be detected.

```javascript
// api/users/create.js
module.exports = async function({ name, email }) {
  return { id: '123', name, email, createdAt: new Date() };
};

module.exports.schema = {
  input: {
    name: { type: 'string', required: true },
    email: { type: 'string', required: true }
  },
  output: {
    id: 'string',
    name: 'string',
    email: 'string',
    createdAt: 'Date'
  },
  description: 'Create a new user'
};
```

You can also use the full TypeDefinition format:

```javascript
module.exports.schema = {
  input: {
    kind: 'object',
    properties: {
      name: { kind: 'primitive', name: 'string' },
      email: { kind: 'primitive', name: 'string' }
    }
  },
  output: {
    kind: 'object',
    properties: {
      id: { kind: 'primitive', name: 'string' },
      name: { kind: 'primitive', name: 'string' },
      email: { kind: 'primitive', name: 'string' },
      createdAt: { kind: 'reference', name: 'Date' }
    }
  }
};
```

### Method 2: TypeScript Definitions

For TypeScript projects, types are automatically extracted from function signatures:

```typescript
// api/users/profile.ts
interface ProfileInput {
  userId: string;
}

interface ProfileOutput {
  name: string;
  email: string;
  avatar?: string;
}

export default async function getProfile(data: ProfileInput): Promise<ProfileOutput> {
  return { name: 'Alice', email: 'alice@example.com' };
}
```

TypeScript literal types and record types are also supported:

```typescript
// api/status/update.ts - Literal types
type Status = 'active' | 'inactive' | 'pending';

export default async function(data: { status: Status }): Promise<{ ok: true }> {
  return { ok: true };
}

// api/settings/bulk.ts - Record/index signature types
export default async function(data: Record<string, string>): Promise<{ updated: number }> {
  return { updated: Object.keys(data).length };
}
```

You can also create companion `.d.ts` files for JavaScript controllers:

```typescript
// api/users/profile.d.ts
interface ProfileInput {
  userId: string;
}

interface ProfileOutput {
  name: string;
  email: string;
}

declare const handler: (data: ProfileInput) => Promise<ProfileOutput>;
export default handler;
```

### Method 3: JSDoc Comments (Fallback)

Traditional JSDoc comments are used when no explicit schema or TypeScript types are found:

```javascript
/**
 * Get user profile by ID
 *
 * @param {Object} data - Request data
 * @param {string} data.userId - The user's unique ID
 * @param {boolean} [data.includeStats] - Include usage statistics
 * @returns {Promise<{name: string, email: string, avatar?: string}>}
 * @throws {Error} User not found
 */
module.exports = async function(data) {
  // Implementation
};
```

### Supported Type Syntax

| JSDoc Type | TypeDefinition Kind |
|------------|---------------------|
| `string`, `number`, `boolean` | `primitive` |
| `Object`, `User`, `CustomType` | `reference` |
| `string[]`, `Array<User>` | `array` |
| `string \| number` | `union` |
| `Promise<T>` | `promise` |
| `{name: string, age: number}` | `object` |

### Nested Object Properties

The JSDoc parser supports single-level nesting for `data.*` properties:

```javascript
/**
 * @param {Object} data
 * @param {string} data.userId - User's ID
 * @param {string} data.email - User's email
 */
```

This creates:
```javascript
{
  kind: 'object',
  properties: {
    userId: { kind: 'primitive', name: 'string', description: "User's ID" },
    email: { kind: 'primitive', name: 'string', description: "User's email" }
  }
}
```

**Limitation:** Multi-level nesting (e.g., `data.user.name`) is not supported and will create flat property names like `user.name`. For deeply nested structures, use the named schema export method or TypeScript definitions.

### Optional Parameters

```javascript
/**
 * @param {string} [data.optional] - Optional parameter
 * @param {string} data.required - Required parameter
 */
```

## File Structure to Endpoint Mapping

The schema generator follows api-ape's convention-based routing:

| File Path | Endpoint |
|-----------|----------|
| `api/users.js` | `/users` |
| `api/users.ts` | `/users` |
| `api/users/profile.js` | `/users/profile` |
| `api/users/profile.ts` | `/users/profile` |
| `api/users/index.js` | `/users` |
| `api/admin/dashboard.js` | `/admin/dashboard` |
| `api/_private.js` | (skipped - underscore prefix) |
| `api/users/profile.d.ts` | (skipped - companion file) |

## Generated TypeScript Declarations

The `generateTypeDeclarations` function produces module augmentation for the `api-ape` package. The output includes:

- **Endpoint interfaces** grouped by namespace (e.g., `UsersEndpoints`)
- **`ApiEndpoints`** - Combined interface for all endpoints
- **`ConnectionState`** - Union type for connection status: `'connecting' | 'connected' | 'disconnected' | 'error'`
- **`api`** - The typed client with event handlers and transport info

Example output:

```typescript
// Auto-generated by @api-ape/schema
// Generated at: 2024-01-21T12:00:00.000Z
// Schema version: abc12345

import 'api-ape';

declare module 'api-ape' {
  /** Endpoints under /users */
  interface UsersEndpoints {
    /**
     * Get user profile by ID
     * @endpoint /users/profile
     */
    profile(data: {
      /** The user's unique ID */
      userId: string;
      /** Include usage statistics */
      includeStats?: boolean;
    }): Promise<{
      name: string;
      email: string;
      avatar?: string;
    }>;
  }

  /** All api-ape endpoints */
  interface ApiEndpoints {
    users: UsersEndpoints & ApiEndpoints;
  }

  type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

  const api: ApiEndpoints & {
    on<T = any>(type: string, handler: (msg: { type: string; data: T }) => void): void;
    onConnectionChange(handler: (state: ConnectionState) => void): () => void;
    readonly transport: 'websocket' | 'polling' | null;
  };

  export default api;
}
```

## Integration with TypeScript

To use the generated types in your project:

1. Generate types to `.api-ape/api-ape.d.ts`
2. Include in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    // ... your options
  },
  "include": [
    "src/**/*",
    ".api-ape/**/*"
  ]
}
```

Or reference directly:

```typescript
/// <reference path="./.api-ape/api-ape.d.ts" />
import api from 'api-ape';

// Now you get IntelliSense!
const profile = await api.users.profile({ userId: '123' });
//    ^? Promise<{ name: string; email: string; avatar?: string }>
```

## Error Handling

The schema generator handles various edge cases gracefully:

- **Missing JSDoc**: Returns `null` for description, input, and output
- **Malformed types**: Falls back to `{ kind: 'any' }`
- **Circular references**: Detected and replaced with `{ kind: 'any', raw: 'circular' }`
- **Non-existent files**: Throws an error

## Troubleshooting

### Schema export not detected

Ensure you're using `module.exports.schema`, not `exports.schema`:

```javascript
// ✅ Correct
module.exports.schema = { ... };

// ❌ Won't be detected
exports.schema = { ... };
```

### TypeScript extraction returns null

Check that your file has a `default` export that is a function:

```typescript
// ✅ Correct
export default async function(data: Input): Promise<Output> { ... }

// ✅ Also correct
const handler = async (data: Input): Promise<Output> => { ... };
export default handler;

// ❌ Won't work - named export
export async function myHandler(data: Input): Promise<Output> { ... }
```

### JSDoc not parsed

Ensure the JSDoc comment is directly above the export statement with no code in between:

```javascript
// ✅ Correct
/**
 * @param {Object} data
 */
module.exports = async function(data) { ... };

// ❌ Won't work - code between comment and export
/**
 * @param {Object} data
 */
const helper = () => {};
module.exports = async function(data) { ... };
```

### Types show as `any`

This can happen when:
- The type string is malformed or unrecognized
- TypeScript is not installed (for `.ts` files)
- The type contains unsupported syntax

Check the `schemaSource` field in the endpoint to see which extraction method was used.

## Dependencies

- `comment-parser`: JSDoc comment parsing

### Optional Peer Dependencies

- `typescript` (>= 4.0): Required for TypeScript-based schema extraction. The TypeScript compiler API is used directly to analyze type information from `.ts` files. If not installed, TypeScript extraction is skipped and the extractor falls back to JSDoc parsing.

```bash
npm install typescript --save-dev
```

**Note:** The TypeScript extractor uses the compiler API to analyze function signatures. It does not extract JSDoc descriptions from TypeScript files - only type information is extracted.

## License

MIT
