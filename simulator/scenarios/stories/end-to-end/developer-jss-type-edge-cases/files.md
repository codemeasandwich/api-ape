# JSS Type Edge Cases Test Scenario Files

Tests JSS serialization edge cases.

## Directory Structure

```
developer-jss-type-edge-cases/
├── error-with-custom-name-survives-round-trip.js
├── nested-set-containing-maps-round-trip.js
├── rangeerror-survives-round-trip.js
├── simple-regexp-pattern-survives-round-trip.js
├── typeerror-survives-round-trip.js
└── undefined-value-preserved-in-object.js
```

## Files

### error-with-custom-name-survives-round-trip.js

Tests that Error objects with custom name properties survive serialization.

### nested-set-containing-maps-round-trip.js

Tests that nested structures containing both Set and Map types are preserved.

### rangeerror-survives-round-trip.js

Tests that RangeError type is preserved through serialization.

### simple-regexp-pattern-survives-round-trip.js

Tests that a simple RegExp without flags survives round-trip.

### typeerror-survives-round-trip.js

Tests that TypeError type is preserved through serialization.

### undefined-value-preserved-in-object.js

Tests that undefined values within objects are preserved.
