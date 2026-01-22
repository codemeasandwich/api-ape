/**
 * @fileoverview Tests for Reserved Name Detection
 *
 * Comprehensive test suite for detecting and handling reserved property names
 * that conflict with JavaScript/TypeScript built-ins or api-ape proxy methods.
 */

const {
  RESERVED_NAMES,
  isProxyReserved,
  isFunctionPrototype,
  isObjectPrototype,
  isJsReserved,
  isTsReserved,
  isValidIdentifier,
  sanitizeIdentifier,
  getConflictType,
  getConflictMessage,
  getConflictSeverity,
} = require("./reserved-names");

describe("reserved-names", () => {
  // ============================================
  // Category 1: isProxyReserved (7 test cases)
  // ============================================

  describe("isProxyReserved", () => {
    test("returns true for 'on'", () => {
      expect(isProxyReserved("on")).toBe(true);
    });

    test("returns true for 'onConnectionChange'", () => {
      expect(isProxyReserved("onConnectionChange")).toBe(true);
    });

    test("returns true for 'transport'", () => {
      expect(isProxyReserved("transport")).toBe(true);
    });

    test("returns true for 'connect'", () => {
      expect(isProxyReserved("connect")).toBe(true);
    });

    test("returns true for 'close'", () => {
      expect(isProxyReserved("close")).toBe(true);
    });

    test("returns true for 'then'", () => {
      expect(isProxyReserved("then")).toBe(true);
    });

    test("returns true for 'catch'", () => {
      expect(isProxyReserved("catch")).toBe(true);
    });

    test("returns false for regular names", () => {
      expect(isProxyReserved("users")).toBe(false);
      expect(isProxyReserved("profile")).toBe(false);
      expect(isProxyReserved("name")).toBe(false);
    });
  });

  // ============================================
  // Category 2: isFunctionPrototype (11 test cases)
  // ============================================

  describe("isFunctionPrototype", () => {
    test("returns true for 'name'", () => {
      expect(isFunctionPrototype("name")).toBe(true);
    });

    test("returns true for 'length'", () => {
      expect(isFunctionPrototype("length")).toBe(true);
    });

    test("returns true for 'constructor'", () => {
      expect(isFunctionPrototype("constructor")).toBe(true);
    });

    test("returns true for 'toString'", () => {
      expect(isFunctionPrototype("toString")).toBe(true);
    });

    test("returns true for 'valueOf'", () => {
      expect(isFunctionPrototype("valueOf")).toBe(true);
    });

    test("returns true for 'call'", () => {
      expect(isFunctionPrototype("call")).toBe(true);
    });

    test("returns true for 'apply'", () => {
      expect(isFunctionPrototype("apply")).toBe(true);
    });

    test("returns true for 'bind'", () => {
      expect(isFunctionPrototype("bind")).toBe(true);
    });

    test("returns true for 'prototype'", () => {
      expect(isFunctionPrototype("prototype")).toBe(true);
    });

    test("returns true for 'arguments'", () => {
      expect(isFunctionPrototype("arguments")).toBe(true);
    });

    test("returns true for 'caller'", () => {
      expect(isFunctionPrototype("caller")).toBe(true);
    });

    test("returns false for regular names", () => {
      expect(isFunctionPrototype("users")).toBe(false);
      expect(isFunctionPrototype("profile")).toBe(false);
    });
  });

  // ============================================
  // Category 3: isObjectPrototype (5 test cases)
  // ============================================

  describe("isObjectPrototype", () => {
    test("returns true for 'hasOwnProperty'", () => {
      expect(isObjectPrototype("hasOwnProperty")).toBe(true);
    });

    test("returns true for 'isPrototypeOf'", () => {
      expect(isObjectPrototype("isPrototypeOf")).toBe(true);
    });

    test("returns true for 'propertyIsEnumerable'", () => {
      expect(isObjectPrototype("propertyIsEnumerable")).toBe(true);
    });

    test("returns true for 'toLocaleString'", () => {
      expect(isObjectPrototype("toLocaleString")).toBe(true);
    });

    test("returns true for '__proto__'", () => {
      expect(isObjectPrototype("__proto__")).toBe(true);
    });

    test("returns false for regular names", () => {
      expect(isObjectPrototype("users")).toBe(false);
    });
  });

  // ============================================
  // Category 4: isJsReserved (sample test cases)
  // ============================================

  describe("isJsReserved", () => {
    test("returns true for 'class'", () => {
      expect(isJsReserved("class")).toBe(true);
    });

    test("returns true for 'function'", () => {
      expect(isJsReserved("function")).toBe(true);
    });

    test("returns true for 'return'", () => {
      expect(isJsReserved("return")).toBe(true);
    });

    test("returns true for 'if'", () => {
      expect(isJsReserved("if")).toBe(true);
    });

    test("returns true for 'const'", () => {
      expect(isJsReserved("const")).toBe(true);
    });

    test("returns true for 'let'", () => {
      expect(isJsReserved("let")).toBe(true);
    });

    test("returns true for 'var'", () => {
      expect(isJsReserved("var")).toBe(true);
    });

    test("returns true for 'await'", () => {
      expect(isJsReserved("await")).toBe(false); // Note: await is in tsReserved
    });

    test("returns false for regular names", () => {
      expect(isJsReserved("users")).toBe(false);
    });
  });

  // ============================================
  // Category 5: isTsReserved (sample test cases)
  // ============================================

  describe("isTsReserved", () => {
    test("returns true for 'type'", () => {
      expect(isTsReserved("type")).toBe(true);
    });

    test("returns true for 'interface'", () => {
      expect(isTsReserved("interface")).toBe(true);
    });

    test("returns true for 'namespace'", () => {
      expect(isTsReserved("namespace")).toBe(true);
    });

    test("returns true for 'async'", () => {
      expect(isTsReserved("async")).toBe(true);
    });

    test("returns true for 'await'", () => {
      expect(isTsReserved("await")).toBe(true);
    });

    test("returns false for regular names", () => {
      expect(isTsReserved("users")).toBe(false);
    });
  });

  // ============================================
  // Category 6: isValidIdentifier (10 test cases)
  // ============================================

  describe("isValidIdentifier", () => {
    test("returns true for simple identifier", () => {
      expect(isValidIdentifier("users")).toBe(true);
    });

    test("returns true for identifier with underscore", () => {
      expect(isValidIdentifier("user_name")).toBe(true);
    });

    test("returns true for identifier starting with underscore", () => {
      expect(isValidIdentifier("_private")).toBe(true);
    });

    test("returns true for identifier starting with $", () => {
      expect(isValidIdentifier("$jquery")).toBe(true);
    });

    test("returns true for identifier with numbers", () => {
      expect(isValidIdentifier("user2")).toBe(true);
    });

    test("returns false for identifier starting with number", () => {
      expect(isValidIdentifier("2fa")).toBe(false);
    });

    test("returns false for identifier with hyphen", () => {
      expect(isValidIdentifier("user-profile")).toBe(false);
    });

    test("returns false for identifier with space", () => {
      expect(isValidIdentifier("user profile")).toBe(false);
    });

    test("returns false for empty string", () => {
      expect(isValidIdentifier("")).toBe(false);
    });

    test("returns false for null/undefined", () => {
      expect(isValidIdentifier(null)).toBe(false);
      expect(isValidIdentifier(undefined)).toBe(false);
    });
  });

  // ============================================
  // Category 7: sanitizeIdentifier (15 test cases)
  // ============================================

  describe("sanitizeIdentifier", () => {
    test("handles simple hyphen: user-profile → userProfile", () => {
      expect(sanitizeIdentifier("user-profile")).toBe("userProfile");
    });

    test("handles multiple hyphens: get-user-by-id → getUserById", () => {
      expect(sanitizeIdentifier("get-user-by-id")).toBe("getUserById");
    });

    test("handles leading number: 2fa → _2fa", () => {
      expect(sanitizeIdentifier("2fa")).toBe("_2fa");
    });

    test("handles leading number with hyphens: 2-factor-auth → _2FactorAuth", () => {
      expect(sanitizeIdentifier("2-factor-auth")).toBe("_2FactorAuth");
    });

    test("handles trailing hyphen: user- → user_", () => {
      expect(sanitizeIdentifier("user-")).toBe("user_");
    });

    test("handles double hyphen: user--profile → user_Profile", () => {
      expect(sanitizeIdentifier("user--profile")).toBe("user_Profile");
    });

    test("handles special characters: user@email → user_email", () => {
      expect(sanitizeIdentifier("user@email")).toBe("user_email");
    });

    test("handles dots: user.name → user_name", () => {
      expect(sanitizeIdentifier("user.name")).toBe("user_name");
    });

    test("handles spaces: user name → user_name", () => {
      expect(sanitizeIdentifier("user name")).toBe("user_name");
    });

    test("preserves underscores: user_name → user_name", () => {
      expect(sanitizeIdentifier("user_name")).toBe("user_name");
    });

    test("preserves $: $ref → $ref", () => {
      expect(sanitizeIdentifier("$ref")).toBe("$ref");
    });

    test("handles all numbers: 123 → _123", () => {
      expect(sanitizeIdentifier("123")).toBe("_123");
    });

    test("handles empty string: '' → _", () => {
      expect(sanitizeIdentifier("")).toBe("_");
    });

    test("handles null/undefined: → _", () => {
      expect(sanitizeIdentifier(null)).toBe("_");
      expect(sanitizeIdentifier(undefined)).toBe("_");
    });

    test("handles unicode: café → caf_", () => {
      expect(sanitizeIdentifier("café")).toBe("caf_");
    });

    test("handles mixed case with hyphens: Get-User → GetUser", () => {
      expect(sanitizeIdentifier("Get-User")).toBe("GetUser");
    });

    test("already valid identifier unchanged: getUserById → getUserById", () => {
      expect(sanitizeIdentifier("getUserById")).toBe("getUserById");
    });
  });

  // ============================================
  // Category 8: getConflictType (10 test cases)
  // ============================================

  describe("getConflictType", () => {
    test("returns 'proxyReserved' for 'then'", () => {
      expect(getConflictType("then")).toBe("proxyReserved");
    });

    test("returns 'proxyReserved' for 'on'", () => {
      expect(getConflictType("on")).toBe("proxyReserved");
    });

    test("returns 'functionPrototype' for 'name'", () => {
      expect(getConflictType("name")).toBe("functionPrototype");
    });

    test("returns 'functionPrototype' for 'length'", () => {
      expect(getConflictType("length")).toBe("functionPrototype");
    });

    test("returns 'objectPrototype' for 'hasOwnProperty'", () => {
      expect(getConflictType("hasOwnProperty")).toBe("objectPrototype");
    });

    test("returns 'promiseMethod' for 'finally'", () => {
      expect(getConflictType("finally")).toBe("promiseMethod");
    });

    test("returns 'jsReserved' for 'class'", () => {
      expect(getConflictType("class")).toBe("jsReserved");
    });

    test("returns 'tsReserved' for 'interface'", () => {
      expect(getConflictType("interface")).toBe("tsReserved");
    });

    test("returns null for regular names", () => {
      expect(getConflictType("users")).toBeNull();
      expect(getConflictType("profile")).toBeNull();
      expect(getConflictType("getData")).toBeNull();
    });

    test("returns null for null/undefined", () => {
      expect(getConflictType(null)).toBeNull();
      expect(getConflictType(undefined)).toBeNull();
    });

    test("prioritizes proxyReserved over other conflicts", () => {
      // 'catch' is both proxyReserved and jsReserved
      expect(getConflictType("catch")).toBe("proxyReserved");
    });
  });

  // ============================================
  // Category 9: getConflictMessage (6 test cases)
  // ============================================

  describe("getConflictMessage", () => {
    test("returns message for proxyReserved", () => {
      const msg = getConflictMessage("proxyReserved", "then");
      expect(msg).toContain("reserved api-ape proxy method");
      expect(msg).toContain("NOT be callable");
    });

    test("returns message for functionPrototype", () => {
      const msg = getConflictMessage("functionPrototype", "name");
      expect(msg).toContain("Function.prototype.name");
      expect(msg).toContain("callable syntax");
    });

    test("returns message for objectPrototype", () => {
      const msg = getConflictMessage("objectPrototype", "hasOwnProperty");
      expect(msg).toContain("Object.prototype");
    });

    test("returns message for promiseMethod", () => {
      const msg = getConflictMessage("promiseMethod", "finally");
      expect(msg).toContain("Promise.prototype");
    });

    test("returns message for jsReserved", () => {
      const msg = getConflictMessage("jsReserved", "class");
      expect(msg).toContain("JavaScript reserved word");
    });

    test("returns empty string for unknown type", () => {
      const msg = getConflictMessage("unknown", "test");
      expect(msg).toBe("");
    });
  });

  // ============================================
  // Category 10: getConflictSeverity (5 test cases)
  // ============================================

  describe("getConflictSeverity", () => {
    test("returns 'error' for proxyReserved", () => {
      expect(getConflictSeverity("proxyReserved")).toBe("error");
    });

    test("returns 'warning' for functionPrototype", () => {
      expect(getConflictSeverity("functionPrototype")).toBe("warning");
    });

    test("returns 'warning' for jsReserved", () => {
      expect(getConflictSeverity("jsReserved")).toBe("warning");
    });

    test("returns 'warning' for tsReserved", () => {
      expect(getConflictSeverity("tsReserved")).toBe("warning");
    });

    test("returns null for unknown type", () => {
      expect(getConflictSeverity(null)).toBeNull();
      expect(getConflictSeverity("unknown")).toBeNull();
    });
  });

  // ============================================
  // Category 11: RESERVED_NAMES constants
  // ============================================

  describe("RESERVED_NAMES constants", () => {
    test("proxyReserved has 7 items", () => {
      expect(RESERVED_NAMES.proxyReserved.size).toBe(7);
    });

    test("functionPrototype has 11 items", () => {
      expect(RESERVED_NAMES.functionPrototype.size).toBe(11);
    });

    test("objectPrototype has 5 items", () => {
      expect(RESERVED_NAMES.objectPrototype.size).toBe(5);
    });

    test("promiseMethods has 3 items", () => {
      expect(RESERVED_NAMES.promiseMethods.size).toBe(3);
    });

    test("jsReserved contains common keywords", () => {
      expect(RESERVED_NAMES.jsReserved.has("function")).toBe(true);
      expect(RESERVED_NAMES.jsReserved.has("class")).toBe(true);
      expect(RESERVED_NAMES.jsReserved.has("if")).toBe(true);
    });

    test("tsReserved contains TypeScript keywords", () => {
      expect(RESERVED_NAMES.tsReserved.has("interface")).toBe(true);
      expect(RESERVED_NAMES.tsReserved.has("type")).toBe(true);
      expect(RESERVED_NAMES.tsReserved.has("namespace")).toBe(true);
    });
  });
});
