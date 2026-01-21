# api-ape Schema Endpoint

Server-side schema introspection for api-ape, enabling LSP and IDE tooling to fetch endpoint metadata from a running server.

## Overview

The schema endpoint exposes your api-ape server's endpoint structure as JSON, allowing development tools to provide:

- **IntelliSense**: Autocompletion for `api.xxx.yyy` calls
- **Type Checking**: Validate endpoint calls and parameters
- **Documentation**: Hover information from JSDoc comments
- **Navigation**: Go-to-definition for controllers

## Endpoint

```
GET /{where}/ape/schema
```

Where `{where}` is your controllers directory path (default: `api`).

### Example

```bash
curl http://localhost:3000/api/ape/schema
```

### Response

```json
{
  "version": "abc12345",
  "timestamp": 1705840800000,
  "controllersDir": "/path/to/project/api",
  "endpoints": [
    {
      "path": "users/profile",
      "filePath": "/path/to/project/api/users/profile.js",
      "line": 15,
      "column": 1,
      "description": "Get user profile by ID",
      "input": {
        "kind": "object",
        "properties": {
          "userId": {
            "kind": "primitive",
            "name": "string",
            "description": "The user's unique ID"
          }
        }
      },
      "output": {
        "kind": "promise",
        "resolves": {
          "kind": "object",
          "properties": {
            "name": { "kind": "primitive", "name": "string" },
            "email": { "kind": "primitive", "name": "string" }
          }
        }
      },
      "throws": ["Error: User not found"]
    }
  ],
  "channels": []
}
```

## Features

### Automatic Discovery

The schema endpoint automatically discovers all your controller files using the same logic as api-ape's controller loader:

| File Path | Endpoint |
|-----------|----------|
| `api/users.js` | `/users` |
| `api/users/profile.js` | `/users/profile` |
| `api/users/index.js` | `/users` |
| `api/admin/dashboard.js` | `/admin/dashboard` |
| `api/_private.js` | (skipped) |

### JSDoc Extraction

The endpoint parses JSDoc comments from your controllers:

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
  // ...
};
```

Extracts:
- `description`: "Get user profile by ID"
- `input`: Object with `userId` (required) and `includeStats` (optional)
- `output`: Promise resolving to object with name, email, avatar
- `throws`: ["Error: User not found"]

### Caching & ETag

The endpoint supports HTTP caching:

```bash
# First request
curl -i http://localhost:3000/api/ape/schema
# ETag: abc12345

# Subsequent request with ETag
curl -H "If-None-Match: abc12345" http://localhost:3000/api/ape/schema
# 304 Not Modified (if unchanged)
```

### CORS Support

Cross-origin requests are allowed for IDE/LSP integration:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Usage

### Automatic Integration

The schema endpoint is automatically added when you initialize api-ape:

```javascript
const http = require('http');
const { ape } = require('api-ape');

const server = http.createServer();

ape(server, {
  where: 'api',
  onConnect: (socket, req, send) => {
    // ...
  }
});

server.listen(3000);
// Schema available at: GET /api/ape/schema
```

### Custom Controllers Path

The endpoint path follows your `where` configuration:

```javascript
ape(server, { where: 'controllers' });
// Schema at: GET /controllers/ape/schema

ape(server, { where: 'src/api' });
// Schema at: GET /src/api/ape/schema
```

## API Reference

### Schema Response

```typescript
interface ApeSchema {
  /** MD5 hash of endpoints for cache invalidation */
  version: string;

  /** Unix timestamp of generation */
  timestamp: number;

  /** Absolute path to controllers directory */
  controllersDir: string;

  /** Array of endpoint definitions */
  endpoints: EndpointDefinition[];

  /** Array of pub/sub channels (future) */
  channels: ChannelDefinition[];
}
```

### EndpointDefinition

```typescript
interface EndpointDefinition {
  /** Endpoint path (e.g., "users/profile") */
  path: string;

  /** Absolute path to controller file */
  filePath: string;

  /** Line number of module.exports */
  line: number;

  /** Column number (always 1) */
  column: number;

  /** Description from JSDoc */
  description: string | null;

  /** Input type from @param */
  input: TypeDefinition | null;

  /** Output type from @returns */
  output: TypeDefinition | null;

  /** Errors from @throws */
  throws: string[];
}
```

### TypeDefinition

```typescript
interface TypeDefinition {
  kind: 'primitive' | 'reference' | 'array' | 'union' | 'promise' | 'object' | 'any';
  name?: string;
  raw?: string;
  description?: string;
  optional?: boolean;
  items?: TypeDefinition;
  types?: TypeDefinition[];
  resolves?: TypeDefinition;
  properties?: Record<string, TypeDefinition>;
}
```

## Programmatic Access

### Get Schema Handler

```javascript
const { createSchemaHandler } = require('api-ape/server/lib/schema');

// Create handler
const handler = createSchemaHandler('/path/to/controllers');

// Use in custom server
app.get('/my-schema', handler);
```

### Generate Schema Directly

```javascript
const { generateSchema } = require('api-ape/server/lib/schema');

const schema = generateSchema('/path/to/controllers');
console.log(schema.endpoints);
```

### Refresh Schema

```javascript
const { refreshSchema } = require('api-ape/server/lib/schema');

// After controller files change
refreshSchema('/path/to/controllers');
```

## JSDoc Patterns

### Supported Tags

| Tag | Description |
|-----|-------------|
| `@param {type} name` | Input parameter |
| `@param {type} [name]` | Optional parameter |
| `@param {type} data.prop` | Nested property |
| `@returns {type}` | Return type |
| `@return {type}` | Alias for @returns |
| `@throws {type}` | Error type |
| `@throw {type}` | Alias for @throws |

### Type Syntax

```javascript
// Primitives
@param {string} name
@param {number} age
@param {boolean} active

// Objects
@param {Object} data
@param {{name: string, age: number}} user

// Arrays
@param {string[]} names
@param {Array<User>} users

// Unions
@param {string | number} id

// Promises
@returns {Promise<User>}

// Optional properties
@param {Object} data
@param {string} [data.optional]
```

### Complete Example

```javascript
/**
 * Create a new user account
 *
 * Creates a user with the provided details and sends a welcome email.
 *
 * @param {Object} data - User creation data
 * @param {string} data.email - User's email address (must be unique)
 * @param {string} data.password - Password (min 8 characters)
 * @param {string} [data.name] - Display name (optional)
 * @param {Object} [data.profile] - Profile information
 * @param {string} [data.profile.avatar] - Avatar URL
 * @param {string} [data.profile.bio] - User biography
 * @returns {Promise<{id: string, email: string, createdAt: Date}>}
 * @throws {ValidationError} Invalid email format
 * @throws {ConflictError} Email already exists
 */
module.exports = async function(data) {
  // Validate
  if (!isValidEmail(data.email)) {
    throw new ValidationError('Invalid email format');
  }

  // Check uniqueness
  if (await userExists(data.email)) {
    throw new ConflictError('Email already exists');
  }

  // Create user
  const user = await db.users.create({
    email: data.email,
    password: hashPassword(data.password),
    name: data.name || null,
    profile: data.profile || {}
  });

  // Send welcome email
  await sendWelcomeEmail(user.email);

  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt
  };
};
```

## File Structure

```
server/lib/schema/
├── index.js         # Main exports, createSchemaHandler
├── jsdoc-parser.js  # JSDoc comment parsing
└── README.md        # This file
```

## Integration Points

### Node.js Runtime

The schema endpoint is registered in `server/lib/runtimes/node.js`:

```javascript
// Schema endpoint path
const schemaPath = `/${options.where}/ape/schema`;
const schemaHandler = createSchemaHandler(core.controllersDir);

// In request handler
if (pathname === schemaPath && req.method === 'GET') {
  return schemaHandler(req, res);
}
```

### Main Entry

The `controllersDir` is added to core in `server/lib/main.js`:

```javascript
function createApeCore({ where, ... }) {
  const controllersDir = path.join(process.cwd(), where);
  // ...
  return {
    controllersDir,
    // ...
  };
}
```

## Security Considerations

### Production Usage

The schema endpoint exposes internal structure. Consider:

1. **Disable in production**: Remove or protect the endpoint
2. **Authentication**: Add middleware for authorized access only
3. **Rate limiting**: Prevent abuse

### Example: Protected Endpoint

```javascript
// Custom middleware to protect schema
app.get('/api/ape/schema', (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).send('Not found');
  }
  next();
}, schemaHandler);
```

### Example: Authenticated Access

```javascript
app.get('/api/ape/schema', (req, res, next) => {
  const token = req.headers.authorization;
  if (!isValidDevToken(token)) {
    return res.status(401).send('Unauthorized');
  }
  next();
}, schemaHandler);
```

## Troubleshooting

### Schema returns empty endpoints

**Causes:**
- Controllers directory doesn't exist
- No `.js` files in directory
- All files start with `_` (private)

**Solutions:**
1. Check `where` path is correct
2. Verify controller files exist
3. Check file extensions (only `.js` by default)

### JSDoc not extracted

**Causes:**
- JSDoc not directly above `module.exports`
- Malformed JSDoc syntax
- Using arrow functions without JSDoc

**Solutions:**
1. Place JSDoc immediately before `module.exports`
2. Validate JSDoc syntax
3. Use `function` keyword for documented exports

### Endpoint returns 404

**Causes:**
- Wrong URL path
- Server not initialized with api-ape
- Custom router intercepting

**Solutions:**
1. Check URL matches `/{where}/ape/schema`
2. Verify `ape(server, options)` was called
3. Ensure api-ape handler runs before other routers

## License

MIT
