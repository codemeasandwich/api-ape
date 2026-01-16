# On Connect With Embed Test Scenario Files

Tests verifying that embedded values set during `onConnect` are available in controller context.

## Directory Structure

```
on-connect-with-embed/
├── each-client-can-have-different-embed-values.js
└── embedded-values-available-in-controller-context.js
```

## Files

### `each-client-can-have-different-embed-values.js`

Tests that each connecting client can be assigned different embedded values (like unique user IDs) based on connection order.

### `embedded-values-available-in-controller-context.js`

Tests that values returned in the `embed` object from `onConnect` are accessible as `this.userId`, `this.role`, etc. in controllers.
