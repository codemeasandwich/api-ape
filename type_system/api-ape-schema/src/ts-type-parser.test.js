/**
 * @fileoverview Tests for Lightweight TypeScript Type Parser
 *
 * 50 test cases covering simple to complex TypeScript type patterns
 */

const { parseTypeString, extractSchemaFromTsTypes } = require("./ts-type-parser");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Helper to create a temp file and extract schema
function extractFromContent(content) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-parser-test-"));
  const tmpFile = path.join(tmpDir, "test.ts");
  fs.writeFileSync(tmpFile, content);
  try {
    return extractSchemaFromTsTypes(tmpFile);
  } finally {
    fs.unlinkSync(tmpFile);
    fs.rmdirSync(tmpDir);
  }
}

describe("ts-type-parser", () => {
  describe("parseTypeString", () => {
    // ============================================
    // Category 1: Basic Primitives (10 cases)
    // ============================================

    test("1. string primitive", () => {
      const result = parseTypeString("string");
      expect(result).toEqual({ kind: "primitive", name: "string", raw: "string" });
    });

    test("2. number primitive", () => {
      const result = parseTypeString("number");
      expect(result).toEqual({ kind: "primitive", name: "number", raw: "number" });
    });

    test("3. boolean primitive", () => {
      const result = parseTypeString("boolean");
      expect(result).toEqual({ kind: "primitive", name: "boolean", raw: "boolean" });
    });

    test("4. any primitive", () => {
      const result = parseTypeString("any");
      expect(result).toEqual({ kind: "primitive", name: "any", raw: "any" });
    });

    test("5. null primitive", () => {
      const result = parseTypeString("null");
      expect(result).toEqual({ kind: "primitive", name: "null", raw: "null" });
    });

    test("6. undefined primitive", () => {
      const result = parseTypeString("undefined");
      expect(result).toEqual({ kind: "primitive", name: "undefined", raw: "undefined" });
    });

    test("7. void primitive", () => {
      const result = parseTypeString("void");
      expect(result).toEqual({ kind: "primitive", name: "void", raw: "void" });
    });

    test("8. unknown primitive", () => {
      const result = parseTypeString("unknown");
      expect(result).toEqual({ kind: "primitive", name: "unknown", raw: "unknown" });
    });

    test("9. never primitive", () => {
      const result = parseTypeString("never");
      expect(result).toEqual({ kind: "primitive", name: "never", raw: "never" });
    });

    test("10. bigint primitive", () => {
      const result = parseTypeString("bigint");
      expect(result).toEqual({ kind: "primitive", name: "bigint", raw: "bigint" });
    });

    // ============================================
    // Category 2: Object Types (10 cases)
    // ============================================

    test("11. simple object { name: string }", () => {
      const result = parseTypeString("{ name: string }");
      expect(result.kind).toBe("object");
      expect(result.properties.name).toEqual({
        kind: "primitive",
        name: "string",
        raw: "string",
      });
    });

    test("12. object with multiple properties { a: string; b: number }", () => {
      const result = parseTypeString("{ a: string; b: number }");
      expect(result.kind).toBe("object");
      expect(result.properties.a.name).toBe("string");
      expect(result.properties.b.name).toBe("number");
    });

    test("13. nested object { nested: { deep: boolean } }", () => {
      const result = parseTypeString("{ nested: { deep: boolean } }");
      expect(result.kind).toBe("object");
      expect(result.properties.nested.kind).toBe("object");
      expect(result.properties.nested.properties.deep.name).toBe("boolean");
    });

    test("14. optional property { opt?: string }", () => {
      const result = parseTypeString("{ opt?: string }");
      expect(result.kind).toBe("object");
      expect(result.properties.opt.optional).toBe(true);
      expect(result.properties.opt.name).toBe("string");
    });

    test("15. object with array property { arr: string[] }", () => {
      const result = parseTypeString("{ arr: string[] }");
      expect(result.kind).toBe("object");
      expect(result.properties.arr.kind).toBe("array");
      expect(result.properties.arr.items.name).toBe("string");
    });

    test("16. object with function property { fn: (x: number) => void }", () => {
      const result = parseTypeString("{ fn: (x: number) => void }");
      expect(result.kind).toBe("object");
      expect(result.properties.fn).toBeDefined();
    });

    test("17. empty object {}", () => {
      const result = parseTypeString("{}");
      expect(result.kind).toBe("object");
      expect(result.properties).toEqual({});
    });

    test("18. quoted property key { 'key-name': string }", () => {
      const result = parseTypeString("{ 'key-name': string }");
      expect(result.kind).toBe("object");
      expect(result.properties["key-name"]).toBeDefined();
      expect(result.properties["key-name"].name).toBe("string");
    });

    test("19. readonly property { readonly x: number }", () => {
      const result = parseTypeString("{ readonly x: number }");
      expect(result.kind).toBe("object");
      expect(result.properties.x.name).toBe("number");
    });

    test("20. index signature { [key: string]: number }", () => {
      const result = parseTypeString("{ [key: string]: number }");
      expect(result.kind).toBe("record");
      expect(result.key.name).toBe("string");
      expect(result.value.name).toBe("number");
    });

    // ============================================
    // Category 3: Arrays (5 cases)
    // ============================================

    test("21. simple array string[]", () => {
      const result = parseTypeString("string[]");
      expect(result.kind).toBe("array");
      expect(result.items.name).toBe("string");
    });

    test("22. generic array Array<string>", () => {
      const result = parseTypeString("Array<string>");
      expect(result.kind).toBe("array");
      expect(result.items.name).toBe("string");
    });

    test("23. union array (string | number)[]", () => {
      const result = parseTypeString("(string | number)[]");
      expect(result.kind).toBe("array");
      expect(result.items.kind).toBe("union");
      expect(result.items.types.length).toBe(2);
    });

    test("24. nested array string[][]", () => {
      const result = parseTypeString("string[][]");
      expect(result.kind).toBe("array");
      expect(result.items.kind).toBe("array");
      expect(result.items.items.name).toBe("string");
    });

    test("25. object array { id: number }[]", () => {
      const result = parseTypeString("{ id: number }[]");
      expect(result.kind).toBe("array");
      expect(result.items.kind).toBe("object");
      expect(result.items.properties.id.name).toBe("number");
    });

    // ============================================
    // Category 4: Unions & Intersections (5 cases)
    // ============================================

    test("26. simple union string | number", () => {
      const result = parseTypeString("string | number");
      expect(result.kind).toBe("union");
      expect(result.types.length).toBe(2);
      expect(result.types[0].name).toBe("string");
      expect(result.types[1].name).toBe("number");
    });

    test("27. string literal union 'a' | 'b' | 'c'", () => {
      const result = parseTypeString("'a' | 'b' | 'c'");
      expect(result.kind).toBe("union");
      expect(result.types.length).toBe(3);
      expect(result.types[0].value).toBe("a");
      expect(result.types[1].value).toBe("b");
      expect(result.types[2].value).toBe("c");
    });

    test("28. intersection A & B", () => {
      const result = parseTypeString("A & B");
      expect(result.kind).toBe("intersection");
      expect(result.types.length).toBe(2);
      expect(result.types[0].name).toBe("A");
      expect(result.types[1].name).toBe("B");
    });

    test("29. nullable union null | undefined | string", () => {
      const result = parseTypeString("null | undefined | string");
      expect(result.kind).toBe("union");
      expect(result.types.length).toBe(3);
    });

    test("30. object union { a: 1 } | { b: 2 }", () => {
      const result = parseTypeString("{ a: number } | { b: string }");
      expect(result.kind).toBe("union");
      expect(result.types[0].kind).toBe("object");
      expect(result.types[1].kind).toBe("object");
    });

    // ============================================
    // Category 5: Type References (5 cases)
    // ============================================

    test("31. simple type reference UserProfile", () => {
      const result = parseTypeString("UserProfile");
      expect(result.kind).toBe("reference");
      expect(result.name).toBe("UserProfile");
    });

    test("32. Partial<User>", () => {
      const result = parseTypeString("Partial<User>");
      expect(result.kind).toBe("reference");
      expect(result.name).toBe("Partial");
      expect(result.typeArguments[0].name).toBe("User");
    });

    test("33. Record<string, number>", () => {
      const result = parseTypeString("Record<string, number>");
      expect(result.kind).toBe("record");
      expect(result.key.name).toBe("string");
      expect(result.value.name).toBe("number");
    });

    test("34. Pick<User, 'name'>", () => {
      const result = parseTypeString("Pick<User, 'name'>");
      expect(result.kind).toBe("reference");
      expect(result.name).toBe("Pick");
      expect(result.typeArguments.length).toBe(2);
    });

    test("35. Map<string, User>", () => {
      const result = parseTypeString("Map<string, User>");
      expect(result.kind).toBe("reference");
      expect(result.name).toBe("Map");
      expect(result.typeArguments.length).toBe(2);
    });

    // ============================================
    // Category 6: Async/Promise (5 cases)
    // ============================================

    test("36. Promise<number> unwraps to number", () => {
      const result = parseTypeString("Promise<number>");
      expect(result.kind).toBe("primitive");
      expect(result.name).toBe("number");
    });

    test("37. Promise<{ id: number }> unwraps to object", () => {
      const result = parseTypeString("Promise<{ id: number }>");
      expect(result.kind).toBe("object");
      expect(result.properties.id.name).toBe("number");
    });

    test("38. Promise<void> unwraps to void", () => {
      const result = parseTypeString("Promise<void>");
      expect(result.kind).toBe("primitive");
      expect(result.name).toBe("void");
    });

    test("39. Promise<User[]> unwraps to array", () => {
      const result = parseTypeString("Promise<User[]>");
      expect(result.kind).toBe("array");
      expect(result.items.name).toBe("User");
    });

    test("40. Promise<string | null> unwraps to union", () => {
      const result = parseTypeString("Promise<string | null>");
      expect(result.kind).toBe("union");
      expect(result.types.length).toBe(2);
    });

    // ============================================
    // Category 7: Literals (5 cases)
    // ============================================

    test("41. string literal 'hello'", () => {
      const result = parseTypeString("'hello'");
      expect(result.kind).toBe("literal");
      expect(result.value).toBe("hello");
    });

    test("42. numeric literal 42", () => {
      const result = parseTypeString("42");
      expect(result.kind).toBe("literal");
      expect(result.value).toBe(42);
    });

    test("43. boolean literal true", () => {
      const result = parseTypeString("true");
      expect(result.kind).toBe("literal");
      expect(result.value).toBe(true);
    });

    test("44. boolean literal false", () => {
      const result = parseTypeString("false");
      expect(result.kind).toBe("literal");
      expect(result.value).toBe(false);
    });

    test("45. negative numeric literal -10", () => {
      const result = parseTypeString("-10");
      expect(result.kind).toBe("literal");
      expect(result.value).toBe(-10);
    });
  });

  describe("extractSchemaFromTsTypes", () => {
    // ============================================
    // Category 8: Export Variations (5 cases)
    // ============================================

    test("46. module.exports = function(data: string): number", () => {
      const schema = extractFromContent(`
        module.exports = function(data: string): number {
          return 42;
        }
      `);
      expect(schema).not.toBeNull();
      expect(schema.input.name).toBe("string");
      expect(schema.output.name).toBe("number");
      expect(schema.source).toBe("ts-parser");
    });

    test("47. export default function(data: string): number", () => {
      const schema = extractFromContent(`
        export default function(data: string): number {
          return 42;
        }
      `);
      expect(schema).not.toBeNull();
      expect(schema.input.name).toBe("string");
      expect(schema.output.name).toBe("number");
    });

    test("48. export default async function handler(data: string): Promise<number>", () => {
      const schema = extractFromContent(`
        export default async function handler(data: string): Promise<number> {
          return 42;
        }
      `);
      expect(schema).not.toBeNull();
      expect(schema.input.name).toBe("string");
      expect(schema.output.name).toBe("number");
    });

    test("49. export default arrow function (data: string): number =>", () => {
      const schema = extractFromContent(`
        export default (data: string): number => {
          return 42;
        }
      `);
      expect(schema).not.toBeNull();
      expect(schema.input.name).toBe("string");
      expect(schema.output.name).toBe("number");
    });

    test("50. module.exports = async arrow (data: string): Promise<number> =>", () => {
      const schema = extractFromContent(`
        module.exports = async (data: string): Promise<number> => {
          return 42;
        }
      `);
      expect(schema).not.toBeNull();
      expect(schema.input.name).toBe("string");
      expect(schema.output.name).toBe("number");
    });

    // ============================================
    // Category 9: Edge Cases (additional)
    // ============================================

    test("file with no export returns null", () => {
      const schema = extractFromContent(`
        function helper(x: string): string {
          return x;
        }
      `);
      expect(schema).toBeNull();
    });

    test("export that is not a function returns null", () => {
      const schema = extractFromContent(`
        export default { name: "test" };
      `);
      expect(schema).toBeNull();
    });

    test("function with this parameter extracts data param", () => {
      const schema = extractFromContent(`
        module.exports = function(this: any, data: { user: string }): { result: boolean } {
          return { result: true };
        }
      `);
      expect(schema).not.toBeNull();
      expect(schema.input.kind).toBe("object");
      expect(schema.input.properties.user.name).toBe("string");
    });

    test("function with no parameters", () => {
      const schema = extractFromContent(`
        module.exports = function(): string {
          return "hello";
        }
      `);
      expect(schema).not.toBeNull();
      expect(schema.input).toBeNull();
      expect(schema.output.name).toBe("string");
    });

    test("function with complex object types", () => {
      const schema = extractFromContent(`
        module.exports = function(data: { user: string; text: string }): { user: string; text: string } {
          return data;
        }
      `);
      expect(schema).not.toBeNull();
      expect(schema.input.kind).toBe("object");
      expect(schema.input.properties.user.name).toBe("string");
      expect(schema.input.properties.text.name).toBe("string");
      expect(schema.output.kind).toBe("object");
    });

    test("function with multiline formatting", () => {
      const schema = extractFromContent(`
        module.exports = function(
          data: {
            user: string;
            text: string;
          }
        ): {
          result: boolean
        } {
          return { result: true };
        }
      `);
      expect(schema).not.toBeNull();
      expect(schema.input.kind).toBe("object");
      expect(schema.output.kind).toBe("object");
    });

    test("function with comments interspersed", () => {
      const schema = extractFromContent(`
        // This is a handler
        module.exports = function(
          /* input data */ data: { user: string }
        ): { result: boolean } /* return type */ {
          return { result: true };
        }
      `);
      expect(schema).not.toBeNull();
      expect(schema.input.kind).toBe("object");
    });
  });
});