# api-ape IntelliSense for VS Code

Official Visual Studio Code extension for api-ape, providing IntelliSense, type checking, and code navigation for api-ape WebSocket APIs.

## Features

### Intelligent Autocompletion

Get smart suggestions as you type your api-ape calls:

```javascript
import api from 'api-ape';

// Type "api." and see all available endpoints
api.users.profile({ userId: '123' });
//  ^^^^^^^^^^^^^
//  Suggestions appear here!
```

### Hover Documentation

Hover over any api-ape call to see full documentation:

- Endpoint path and description
- Input parameter types with descriptions
- Return type information
- Source file location

### Go-to-Definition

Jump directly to controller files:

- **Ctrl+Click** (Windows/Linux) or **Cmd+Click** (Mac) on any endpoint
- Opens the controller file at the exact line of the export

### Real-time Validation

Get instant feedback on invalid endpoints:

- Warning squiggles under unknown endpoints
- Suggestions for similar endpoint names
- Works as you type

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P`
3. Type `ext install api-ape.vscode-api-ape`
4. Press Enter

### From VSIX File

1. Download the `.vsix` file
2. Open VS Code
3. Press `Ctrl+Shift+P` / `Cmd+Shift+P`
4. Type "Install from VSIX"
5. Select the downloaded file

### Manual Installation

```bash
cd type_system/vscode-api-ape
npm install
npm run compile
code --install-extension vscode-api-ape-1.0.0.vsix
```

## Getting Started

### Automatic Setup

The extension automatically activates when it detects an api-ape project:

1. **Install the extension**
2. **Open your api-ape project** (must have `api-ape` in package.json dependencies)
3. **Start your api-ape server** (for live schema)
4. **Start coding!**

The status bar shows "api-ape IntelliSense active" when ready.

### Manual Schema Generation

If you prefer not to run the server, generate types using the CLI:

```bash
npx @api-ape/cli -c ./api -o .api-ape
```

## Configuration

Open Settings (`Ctrl+,` / `Cmd+,`) and search for "api-ape":

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `apiApe.serverUrl` | `http://localhost:3000` | URL of your api-ape server |
| `apiApe.controllersPath` | `api` | Path to controllers directory |
| `apiApe.autoGenerateTypes` | `true` | Auto-generate .d.ts on schema change |
| `apiApe.typesOutputPath` | `.api-ape` | Output directory for generated types |
| `apiApe.validateOnType` | `true` | Show warnings for invalid endpoints |

### Settings JSON

```json
{
  "apiApe.serverUrl": "http://localhost:8080",
  "apiApe.controllersPath": "src/api",
  "apiApe.autoGenerateTypes": true,
  "apiApe.typesOutputPath": ".api-ape",
  "apiApe.validateOnType": true
}
```

### Workspace Settings

For project-specific configuration, add to `.vscode/settings.json`:

```json
{
  "apiApe.serverUrl": "http://localhost:3001",
  "apiApe.controllersPath": "backend/api"
}
```

## Commands

Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type "api-ape":

| Command | Description |
|---------|-------------|
| `api-ape: Refresh Schema` | Force refresh schema from server |
| `api-ape: Generate Type Definitions` | Generate .d.ts files using CLI |
| `api-ape: Configure Server URL` | Quick-set server URL |

### Keyboard Shortcuts

You can bind commands to keyboard shortcuts in `keybindings.json`:

```json
[
  {
    "key": "ctrl+alt+r",
    "command": "apiApe.refreshSchema",
    "when": "editorTextFocus"
  }
]
```

## How It Works

### Schema Sources

The extension gets endpoint information from:

1. **Running Server** (preferred): Fetches from `GET /api/ape/schema`
2. **Local File** (fallback): Reads `.api-ape/schema.json`

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       VS Code Extension                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐         ┌─────────────────────────────┐  │
│  │   Extension     │◄───────►│     Language Server         │  │
│  │   (Client)      │   IPC   │     (@api-ape/lsp)          │  │
│  └────────┬────────┘         └──────────────┬──────────────┘  │
│           │                                  │                  │
│           │                                  ▼                  │
│           │                  ┌─────────────────────────────┐  │
│           │                  │    Schema Manager           │  │
│           │                  │                             │  │
│           │                  │  ┌───────┐    ┌──────────┐ │  │
│           │                  │  │Server │ or │Local File│ │  │
│           │                  │  │ /ape/ │    │.api-ape/ │ │  │
│           │                  │  │schema │    │schema.json│ │  │
│           │                  │  └───────┘    └──────────┘ │  │
│           │                  └─────────────────────────────┘  │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────┐                                          │
│  │  File Watcher   │                                          │
│  │                 │                                          │
│  │  Watches:       │                                          │
│  │  **/api/**/*.js │                                          │
│  └─────────────────┘                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### File Watching

The extension watches your controllers directory for changes:

- **File Modified**: Triggers schema refresh
- **File Created**: Adds new endpoint to schema
- **File Deleted**: Removes endpoint from schema

## TypeScript Integration

### Automatic Type Generation

When `apiApe.autoGenerateTypes` is enabled, the extension generates TypeScript declarations automatically.

### Manual Setup

1. Run "api-ape: Generate Type Definitions"
2. Add to your `tsconfig.json`:

```json
{
  "include": ["src/**/*", ".api-ape/**/*"]
}
```

### Type Safety

With generated types, you get full TypeScript checking:

```typescript
import api from 'api-ape';

// ✅ Valid call
const user = await api.users.profile({ userId: '123' });
//    ^? Promise<{ name: string; email: string; avatar?: string }>

// ❌ Type error: missing required property
const user = await api.users.profile({});
//                                    ^
// Property 'userId' is missing in type '{}'

// ❌ Type error: unknown endpoint
const data = await api.users.nonExistent();
//                           ^^^^^^^^^^^
// Property 'nonExistent' does not exist on type 'UsersEndpoints'
```

## Workspace Detection

The extension activates when it detects an api-ape workspace:

### Detection Criteria

1. **package.json**: Contains `api-ape` in dependencies or devDependencies
2. **.api-ape directory**: Exists in workspace root
3. **.api-ape.json**: Configuration file exists

### Multi-root Workspaces

In multi-root workspaces, the extension activates for each folder that matches the criteria.

## Troubleshooting

### Extension not activating

**Symptoms:** No "api-ape IntelliSense active" message, no completions

**Solutions:**
1. Check that `api-ape` is in your package.json dependencies
2. Reload VS Code window (`Ctrl+Shift+P` → "Reload Window")
3. Check Output panel for errors (View → Output → select "api-ape")

### No completions appearing

**Symptoms:** Typing `api.` shows no suggestions

**Solutions:**
1. Check server is running: `curl http://localhost:3000/api/ape/schema`
2. Generate schema manually: `npx @api-ape/cli -c ./api`
3. Run "api-ape: Refresh Schema" command
4. Check `apiApe.serverUrl` setting matches your server

### Wrong or outdated completions

**Symptoms:** Completions show old or incorrect endpoints

**Solutions:**
1. Run "api-ape: Refresh Schema"
2. Restart your api-ape server
3. Regenerate types: Run "api-ape: Generate Type Definitions"
4. Check file watcher is working (modify a controller, see if schema updates)

### Hover not showing documentation

**Symptoms:** Hovering shows nothing or generic info

**Solutions:**
1. Add JSDoc to your controllers
2. Ensure cursor is on the property name (not `api` or parentheses)
3. Regenerate schema after adding JSDoc

### Go-to-definition not working

**Symptoms:** Ctrl+Click does nothing or opens wrong file

**Solutions:**
1. Schema might be outdated - refresh it
2. Check that `filePath` in schema is correct (absolute path)
3. Ensure the controller file exists

### Performance issues

**Symptoms:** VS Code slow when typing, high CPU usage

**Solutions:**
1. Disable `apiApe.validateOnType` if not needed
2. Reduce schema refresh frequency
3. Check for large controller directories

### Server connection errors

**Symptoms:** "Failed to fetch schema" errors

**Solutions:**
1. Verify server is running
2. Check `apiApe.serverUrl` is correct
3. Ensure no CORS issues (schema endpoint allows *)
4. Check firewall/proxy settings

## Output Channel

View extension logs in the Output panel:

1. View → Output (or `Ctrl+Shift+U` / `Cmd+Shift+U`)
2. Select "api-ape Language Server" from dropdown

Logs include:
- Schema fetch attempts
- File watcher events
- Errors and warnings

## Contributing

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/api-ape.git
cd api-ape/type_system/vscode-api-ape

# Install dependencies
npm install

# Open in VS Code
code .
```

### Running in Development

1. Press `F5` to launch Extension Development Host
2. Open a project with api-ape
3. Test the extension features

### Building

```bash
# Compile
npm run compile

# Package as VSIX
npx vsce package
```

## Requirements

- VS Code 1.85.0 or higher
- Node.js 18.0.0 or higher (for Language Server)
- api-ape 4.0.0 or higher

## Known Issues

1. **Path parameters not typed**: `api.users('/123')` doesn't provide parameter typing
2. **Subscription callbacks**: Return type for subscriptions is generic
3. **Chained calls**: `api.users('/123').profile()` pattern not fully supported

## Release Notes

### 1.0.0

- Initial release
- Completions for api-ape proxy chains
- Hover documentation from JSDoc
- Go-to-definition for controllers
- Real-time validation
- File watching for hot reload

## License

MIT

## Links

- [api-ape Documentation](https://github.com/codemeasandwich/api-ape)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Report Issues](https://github.com/codemeasandwich/api-ape/issues)
