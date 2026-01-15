# SSS Module

Shamir Secret Sharing over GF(256).

## Directory Structure

```
sss/
├── constants.js     - SSS error codes
├── gf256.js         - Galois Field GF(256) arithmetic
└── serialization.js - Share serialization/deserialization
```

## Files

### `constants.js`
Defines SSSError codes for share validation.

### `gf256.js`
GF(256) multiplication, division, addition (XOR), polynomial evaluation, and Lagrange interpolation.

### `serialization.js`
Base64url share serialization with index prefix, deserialization, and format verification.
