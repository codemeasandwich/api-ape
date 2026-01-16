# Request Patterns Test Scenario Files

Tests various request patterns.

## Directory Structure

```
developer-request-patterns/
├── falsy-values-handled-correctly.js
├── large-payload-transmitted-correctly.js
└── repeated-requests-with-different-data-work.js
```

## Files

### falsy-values-handled-correctly.js

Tests that falsy values (0, empty string, false, null) are correctly preserved through API calls.

### large-payload-transmitted-correctly.js

Tests that a large payload with 100 properties and long values is transmitted correctly.

### repeated-requests-with-different-data-work.js

Tests that multiple concurrent requests with different data all complete successfully with correct responses.
