# JSS Actions Module Files

This module provides atomic operations for testing api-ape's JSS (JavaScript Serialization) type support. JSS extends JSON to preserve JavaScript types like Date, RegExp, Error, Set, Map, and undefined.

## Guidelines

- **Use echo endpoint** — Most JSS tests use an echo controller that returns input unchanged
- **Type checking** — Use `assertType()` to verify correct type reconstruction
- **Deep equality** — Use `deepEqual()` for comparing complex structures
- **Test variations** — Test edge cases like empty collections, complex flags, error subtypes

## Directory Structure

```
jss/
├── index.js             # Module entry point, re-exports all actions
├── roundTrip.js         # Send data, receive it back, verify types preserved
├── testAllTypes.js      # Test all JSS types in one call
├── testDate.js          # Test Date type round-trip
├── testRegExp.js        # Test RegExp type round-trip (with flags)
├── testError.js         # Test Error type round-trip (and subtypes)
├── testSet.js           # Test Set type round-trip
├── testMap.js           # Test Map type round-trip
├── testUndefined.js     # Test undefined value preservation
├── testNestedComplex.js # Test complex nested structures
├── createTestData.js    # Create test data with various types
├── assertType.js        # Assert value is instance of expected type
└── deepEqual.js         # Deep equality check for complex types
```

## Files

### `index.js`

Module entry point that re-exports all JSS actions for convenient importing.

### `roundTrip.js`

Sends data through an echo endpoint and verifies types are preserved on return.

### `testAllTypes.js`

Comprehensive test that sends all JSS-supported types and verifies each.

### `testDate.js`

Tests Date object round-trip, including edge cases like epoch and far-future dates.

### `testRegExp.js`

Tests RegExp round-trip including various flag combinations (g, i, m, u, y, s).

### `testError.js`

Tests Error round-trip including subtypes (TypeError, RangeError, etc.) and custom properties.

### `testSet.js`

Tests Set round-trip including empty sets and sets with complex values.

### `testMap.js`

Tests Map round-trip including maps with non-string keys.

### `testUndefined.js`

Tests that undefined values are preserved (not converted to null or omitted).

### `testNestedComplex.js`

Tests complex nested structures with multiple types at various depths.

### `createTestData.js`

Creates test data objects containing various JSS-supported types.

### `assertType.js`

Asserts that a value is an instance of the expected type after round-trip.

### `deepEqual.js`

Performs deep equality comparison that handles JSS types correctly.
