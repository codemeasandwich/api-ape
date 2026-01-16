# JSS Sub-Modules Files

This module contains the low-level encoding and decoding implementations for JSON Super Set (JSS). The encoder traverses objects to detect and tag extended types, while the decoder parses tagged keys and reconstructs the original JavaScript types.

## Guidelines

- **Tag consistency** — Encoding and decoding tags must match exactly; if you add a new tag to `encode.js`, add the corresponding decoder to `decode.js`
- **Type detection** — Use `Object.prototype.toString.call()` for reliable type detection, not `instanceof`
- **Circular reference tracking** — Both encoder and decoder must handle circular references via the `<!P>` path pointer tag
- **Isomorphic code** — All code must work in both browser and Node.js/Bun/Deno environments
- **Preserve error stacks** — Error encoding must preserve the original stack trace for debugging
- **No external dependencies** — Pure JavaScript only; no external packages

## Directory Structure

```
jss/
├── encode.js   # JSS encoding (object → tagged JSON-compatible format)
└── decode.js   # JSS decoding (tagged format → restored JavaScript types)
```

## Files

### `encode.js`

Converts JavaScript objects containing extended types into JSON-compatible format:

- Detects types via `Object.prototype.toString`
- Tags keys with type indicators (`<!D>`, `<!R>`, `<!E>`, `<!U>`, `<!M>`, `<!S>`, `<!P>`)
- Converts Dates to timestamps, RegExps to strings, Errors to arrays
- Tracks visited objects to handle circular references

**Exports:**

- `encode(obj)` — Returns JSS-encoded plain object (for inspection or custom serialization)
- `stringify(obj)` — Returns JSS-encoded JSON string (encode + JSON.stringify)

**Tag Reference:**

| Tag | Type | Encoded Value |
|-----|------|---------------|
| `<!D>` | Date | Unix timestamp (milliseconds) |
| `<!R>` | RegExp | String representation (e.g., "/test/gi") |
| `<!E>` | Error | Array: [name, message, stack] |
| `<!U>` | undefined | null |
| `<!M>` | Map | Object from entries |
| `<!S>` | Set | Array of values |
| `<!P>` | Pointer | Path array to referenced object (circular refs) |

### `decode.js`

Restores JavaScript types from JSS-encoded format:

- Parses tagged keys to identify encoded types
- Reconstructs Date, RegExp, Error, Map, Set, and undefined
- Resolves circular reference pointers to restore object cycles
- Handles nested structures recursively

**Exports:**

- `decode(obj)` — Decodes JSS-encoded plain object back to original types
- `parse(str)` — Parses JSS string and decodes (JSON.parse + decode)

**Decoding Process:**

1. First pass: Decode all values, storing pointer locations
2. Second pass: Resolve `<!P>` pointers by following stored paths
3. Return fully restored object with original types and circular references