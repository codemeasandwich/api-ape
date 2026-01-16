# JSS Types Test Scenario Files

Tests verifying that JavaScript-native types survive serialization round-trips through JSS.

## Directory Structure

```
jss-types/
├── index.js
├── array-of-typed-values.js
├── complex-nested-types.js
├── date-survives-roundtrip.js
├── error-survives-roundtrip.js
├── map-survives-roundtrip.js
├── regexp-no-flags.js
├── regexp-survives-roundtrip.js
├── set-survives-roundtrip.js
├── typeerror-survives-roundtrip.js
└── undefined-survives-roundtrip.js
```

## Files

### `index.js`

Test suite registration file that imports and registers all JSS type tests.

### `array-of-typed-values.js`

Tests that arrays containing typed values (Date, Set, Map) survive round-trip serialization.

### `complex-nested-types.js`

Tests that deeply nested objects with multiple typed values (Date, RegExp, Set, Map) survive round-trip serialization.

### `date-survives-roundtrip.js`

Tests that Date objects are serialized and deserialized correctly, maintaining their timestamp value.

### `error-survives-roundtrip.js`

Tests that Error objects survive round-trip serialization with their message intact.

### `map-survives-roundtrip.js`

Tests that Map objects are serialized and deserialized correctly, maintaining their key-value pairs.

### `regexp-no-flags.js`

Tests that RegExp objects without flags survive round-trip serialization with source and empty flags.

### `regexp-survives-roundtrip.js`

Tests that RegExp objects with flags are serialized and deserialized correctly, preserving source and flags.

### `set-survives-roundtrip.js`

Tests that Set objects are serialized and deserialized correctly, maintaining their values.

### `typeerror-survives-roundtrip.js`

Tests that TypeError instances survive round-trip serialization with their type and message preserved.

### `undefined-survives-roundtrip.js`

Tests that undefined values in objects (including nested) survive round-trip serialization.
