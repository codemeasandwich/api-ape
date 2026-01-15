# Controller Context Test Scenario Files

Tests verifying that controller context values like `this.clientId` are accessible and unique.

## Directory Structure

```
controller-context/
├── client-id-accessible-in-users-controller.js
└── client-id-is-unique-per-connection.js
```

## Files

### `client-id-accessible-in-users-controller.js`

Tests that `this.clientId` is accessible within controller methods and contains a defined string value.

### `client-id-is-unique-per-connection.js`

Tests that each client connection receives a unique `clientId` value in the controller context.
