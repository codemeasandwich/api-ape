# @api-ape/schema

Schema generator for api-ape - extracts endpoint metadata from controller files.

## Overview

This package provides the core schema generation functionality used by both the server-side schema endpoint and the CLI tool. It parses JSDoc comments from api-ape controller files to extract:

- Endpoint paths (derived from file structure)
- Input parameter types (`@param`)
- Return types (`@returns`)
- Error types (`@throws`)
- Descriptions and documentation

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
//   endpoints: [...],
//   channels: []
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
  - `extensions` (string[]): File extensions to include (default: `['js']`)

**Returns:** `ApeSchema` object

```typescript
interface ApeSchema {
  version: string;           // MD5 hash for cache invalidation
  timestamp: number;         // Generation timestamp
  controllersDir: string;    // Source directory
  endpoints: EndpointDefinition[];
  channels: ChannelDefinition[];
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

## Schema Format

### EndpointDefinition

```typescript
interface EndpointDefinition {
  path: string;              // "users/profile"
  filePath: string;          // Absolute path to controller
  line: number;              // Line number of export
  column: number;            // Column (always 1)
  description: string | null;
  input: TypeDefinition | null;
  output: TypeDefinition | null;
  throws: string[];
}
```

### TypeDefinition

```typescript
interface TypeDefinition {
  kind: 'primitive' | 'reference' | 'array' | 'union' | 'promise' | 'object' | 'any';
  name?: string;             // For primitives and references
  raw?: string;              // Original JSDoc string
  description?: string;      // From @param description
  optional?: boolean;        // For object properties
  items?: TypeDefinition;    // For arrays
  types?: TypeDefinition[];  // For unions
  resolves?: TypeDefinition; // For promises
  properties?: Record<string, TypeDefinition>; // For objects
}
```

## JSDoc Conventions

The schema generator recognizes the following JSDoc patterns:

### Basic Controller

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

```javascript
/**
 * @param {Object} data
 * @param {string} data.user.name - User's name
 * @param {string} data.user.email - User's email
 */
```

This creates:
```javascript
{
  kind: 'object',
  properties: {
    user: {
      kind: 'object',
      properties: {
        name: { kind: 'primitive', name: 'string', description: "User's name" },
        email: { kind: 'primitive', name: 'string', description: "User's email" }
      }
    }
  }
}
```

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
| `api/users/profile.js` | `/users/profile` |
| `api/users/index.js` | `/users` |
| `api/admin/dashboard.js` | `/admin/dashboard` |
| `api/_private.js` | (skipped - underscore prefix) |

## Generated TypeScript Declarations

The `generateTypeDeclarations` function produces module augmentation for the `api-ape` package:

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
- **Circular references**: Not supported in type definitions
- **Non-existent files**: Throws an error

## Dependencies

- `comment-parser`: JSDoc comment parsing

## License

MIT
