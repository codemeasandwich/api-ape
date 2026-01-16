# JSS Sub-Modules

## Overview

The jss sub-modules contain the low-level encoding and decoding implementations for JSON Super Set (JSS). These modules handle the actual conversion logic that transforms JavaScript extended types into JSON-compatible tagged representations and restores them back.

The encoder traverses objects to detect and tag extended types (Date, RegExp, Error, Map, Set, undefined), while the decoder parses tagged keys and reconstructs the original types. Both modules handle circular references through path-based pointers.

**Key capabilities:**

- **Type detection** — Identify JavaScript types that require special serialization
- **Tag encoding** — Convert extended types to primitives with tagged keys (e.g., `<!D>` for Date)
- **Tag decoding** — Restore tagged values back to their original JavaScript types
- **Circular reference handling** — Track and resolve object cycles via path pointers

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## See Also

- [`../jss.js`](../jss.js) — Main JSS module (re-exports encode/decode)
- [`../README.md`](../README.md) — Utils module overview